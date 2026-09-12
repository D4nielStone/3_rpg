import * as CANNON from 'cannon-es';
import { normalizePlayerScale } from '../../shared/player-size.js';

function addCapsule(body, scale = [1, 1, 1]) {
  const radius = Math.max(0.25, Math.min(Math.abs(scale[0] ?? 1), Math.abs(scale[2] ?? 1)) * 0.5);
  const height = Math.max(radius * 2, Math.abs(scale[1] ?? 1));
  const cylinderHeight = Math.max(0, height - radius * 2);
  body.addShape(new CANNON.Cylinder(radius, radius, cylinderHeight || 0.001, 12));
  if (cylinderHeight > 0) {
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, cylinderHeight * 0.5, 0));
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, -cylinderHeight * 0.5, 0));
  }
}

function isGroundSurface(entity) {
  return entity?.primitive === 'plane' || entity?.collision?.surface === 'ground';
}

function getCollisionScale(entity) {
  const scale = entity?.collision?.scale ?? [1, 1, 1];
  return scale.map((value) => Math.max(0.01, Math.abs(Number(value) || 1)));
}

function getStaticColliderBounds(entity) {
  if (!entity?.collision?.enabled || !Array.isArray(entity.position)) return null;
  const scale = entity.scale ?? [1, 1, 1];
  const collisionScale = getCollisionScale(entity);
  const offset = entity.collision.offset ?? [0, 0, 0];
  const halfX = Math.max(0.25, Math.abs(Number(scale[0]) || 1) * collisionScale[0] * 0.5);
  const halfY = isGroundSurface(entity) ? 0.05 : Math.max(0.05, Math.abs(Number(scale[1]) || 1) * collisionScale[1] * 0.5);
  const halfZ = Math.max(0.25, Math.abs(Number(scale[2]) || 1) * collisionScale[2] * 0.5);
  return {
    id: entity.id ?? null,
    name: entity.name ?? entity.id ?? 'objeto sem nome',
    minX: entity.position[0] + (Number(offset[0]) || 0) - halfX,
    maxX: entity.position[0] + (Number(offset[0]) || 0) + halfX,
    minY: entity.position[1] + (Number(offset[1]) || 0) - halfY,
    maxY: entity.position[1] + (Number(offset[1]) || 0) + halfY,
    minZ: entity.position[2] + (Number(offset[2]) || 0) - halfZ,
    maxZ: entity.position[2] + (Number(offset[2]) || 0) + halfZ,
  };
}

function findBlockingCollider(from, to, radius, colliders) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 0.15));

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const position = [
      from[0] + dx * t,
      from[1],
      from[2] + dz * t,
    ];

    const blocked = colliders.find((collider) => {
      if (!collider) return false;
      if (collider.maxY <= from[1] + 0.1 && collider.maxY - collider.minY <= 0.5) return false;
      const minX = collider.minX - radius;
      const maxX = collider.maxX + radius;
      const minZ = collider.minZ - radius;
      const maxZ = collider.maxZ + radius;
      return position[0] >= minX && position[0] <= maxX && position[2] >= minZ && position[2] <= maxZ;
    });

    if (blocked) return blocked;
  }

  return null;
}

function addGroundCollider(world) {
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
  body.addShape(new CANNON.Box(new CANNON.Vec3(1000, 0.1, 1000)));
  body.position.set(0, -0.8, 0);
  world.addBody(body);
}

export class PhysicsWorld {
  constructor(mapConfig = null) {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
    this.playerMaterial = new CANNON.Material('player');
    this.bodies = new Map();
    this.lastCollision = null;
    this.playerScale = normalizePlayerScale(mapConfig?.player?.scale);
    this.staticColliders = (mapConfig?.entities ?? [])
      .map((entity) => getStaticColliderBounds(entity))
      .filter(Boolean);
    for (const entity of mapConfig?.entities ?? []) {
      if (!entity.collision?.enabled) continue;
      const scale = entity.scale ?? [1, 1, 1];
      const collisionScale = getCollisionScale(entity);
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
      const material = new CANNON.Material(`static-${entity.id ?? 'collider'}`);
      material.friction = Math.min(1, Math.max(0, Number(entity.collision.friction ?? 0.3) || 0));
      material.restitution = Math.min(1, Math.max(0, Number(entity.collision.restitution ?? 0) || 0));
      if (isGroundSurface(entity) || Math.abs(Number(scale[1]) || 1) * collisionScale[1] <= 0.5) material.friction = 0;
      body.material = material;
      if (entity.collision.shape === 'capsule') {
        addCapsule(body, scale.map((value, index) => value * collisionScale[index]));
      } else {
        body.addShape(new CANNON.Box(new CANNON.Vec3(
          Math.max(0.25, Math.abs(scale[0] ?? 1) * collisionScale[0] * 0.5),
          isGroundSurface(entity) ? 0.05 : Math.max(0.05, Math.abs(scale[1] ?? 1) * collisionScale[1] * 0.5),
          Math.max(0.25, Math.abs(scale[2] ?? 1) * collisionScale[2] * 0.5),
        )));
      }
      const offset = entity.collision.offset ?? [0, 0, 0];
      body.position.set(
        entity.position[0] + (Number(offset[0]) || 0),
        entity.position[1] + (Number(offset[1]) || 0),
        entity.position[2] + (Number(offset[2]) || 0),
      );
      body.quaternion.setFromEuler(...(entity.rotation ?? [0, 0, 0]));
      this.world.addBody(body);
      this.world.addContactMaterial(new CANNON.ContactMaterial(this.playerMaterial, material, {
        friction: material.friction,
        restitution: material.restitution,
      }));
    }
    addGroundCollider(this.world);
  }

  movePlayer(id, from, to, deltaSeconds = 1 / 30) {
    this.lastCollision = null;
    let body = this.bodies.get(id);
    if (!body) {
      body = new CANNON.Body({ mass: 1, fixedRotation: true });
      addCapsule(body, this.playerScale);
      body.material = this.playerMaterial;
      this.world.addBody(body);
      this.bodies.set(id, body);
    }
    const playerRadius = Math.max(0.28, Math.min(this.playerScale[0] ?? 0.7, this.playerScale[2] ?? 0.7) * 0.5);
    const blockingCollider = findBlockingCollider(from, to, playerRadius, this.staticColliders);
    if (blockingCollider) {
      body.position.set(...from);
      this.lastCollision = blockingCollider;
      return [...from];
    }
    body.position.set(...from);
    body.wakeUp();
    body.velocity.set(
      (to[0] - from[0]) / Math.max(deltaSeconds, 1 / 60),
      0,
      (to[2] - from[2]) / Math.max(deltaSeconds, 1 / 60),
    );
    this.world.step(Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1)));
    return [body.position.x, body.position.y, body.position.z];
  }

  teleportPlayer(id, position) {
    const body = this.bodies.get(id);
    if (!body) return;
    body.position.set(...position);
    body.velocity.set(0, 0, 0);
    body.force.set(0, 0, 0);
  }
}
