import * as CANNON from 'cannon-es';

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
  const halfX = Math.max(0.05, Math.abs(Number(scale[0]) || 1) * collisionScale[0] * 0.5);
  const halfY = isGroundSurface(entity) ? 0.05 : Math.max(0.05, Math.abs(Number(scale[1]) || 1) * collisionScale[1] * 0.5);
  const halfZ = Math.max(0.05, Math.abs(Number(scale[2]) || 1) * collisionScale[2] * 0.5);
  return {
    minX: entity.position[0] + (Number(offset[0]) || 0) - halfX,
    maxX: entity.position[0] + (Number(offset[0]) || 0) + halfX,
    minY: entity.position[1] + (Number(offset[1]) || 0) - halfY,
    maxY: entity.position[1] + (Number(offset[1]) || 0) + halfY,
    minZ: entity.position[2] + (Number(offset[2]) || 0) - halfZ,
    maxZ: entity.position[2] + (Number(offset[2]) || 0) + halfZ,
  };
}

function collidesWithStaticColliders(from, to, radius, colliders) {
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

    const blocked = colliders.some((collider) => {
      if (!collider) return false;
      if (collider.maxY <= from[1] + 0.1 && collider.maxY - collider.minY <= 0.5) return false;
      const minX = collider.minX - radius;
      const maxX = collider.maxX + radius;
      const minZ = collider.minZ - radius;
      const maxZ = collider.maxZ + radius;
      return position[0] >= minX && position[0] <= maxX && position[2] >= minZ && position[2] <= maxZ;
    });

    if (blocked) return true;
  }

  return false;
}

function distanceBetween(from, to) {
  return Math.hypot(to[0] - from[0], to[2] - from[2]);
}

function findShortestPath(nodes, colliders, radius) {
  const distances = nodes.map((_, index) => (index === 0 ? 0 : Infinity));
  const previous = nodes.map(() => -1);
  const visited = new Set();

  while (visited.size < nodes.length) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (visited.has(index)) continue;
      if (current < 0 || distances[index] < distances[current]) current = index;
    }
    if (current < 0 || !Number.isFinite(distances[current])) break;
    visited.add(current);
    if (current === 1) break;

    for (let next = 0; next < nodes.length; next += 1) {
      if (visited.has(next) || next === current) continue;
      if (collidesWithStaticColliders(nodes[current], nodes[next], radius, colliders)) continue;
      const distance = distances[current] + distanceBetween(nodes[current], nodes[next]);
      if (distance < distances[next]) {
        distances[next] = distance;
        previous[next] = current;
      }
    }
  }

  if (!Number.isFinite(distances[1])) return [];
  const path = [];
  for (let current = 1; current >= 0; current = previous[current]) {
    path.unshift(nodes[current]);
    if (current === 0) break;
  }
  return path.slice(1);
}

function addStaticColliders(world, mapConfig, playerMaterial) {
  for (const entity of mapConfig?.entities ?? []) {
    if (!entity.collision?.enabled) continue;
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    const material = new CANNON.Material(`static-${entity.id ?? 'collider'}`);
    material.friction = Math.min(1, Math.max(0, Number(entity.collision.friction ?? 0.3) || 0));
    material.restitution = Math.min(1, Math.max(0, Number(entity.collision.restitution ?? 0) || 0));
    const scale = entity.scale ?? [1, 1, 1];
    const collisionScale = getCollisionScale(entity);
    if (isGroundSurface(entity) || Math.abs(Number(scale[1]) || 1) * collisionScale[1] <= 0.5) material.friction = 0;
    body.material = material;
    if (entity.collision.shape === 'capsule') {
      addCapsule(body, scale.map((value, index) => value * collisionScale[index]));
    } else {
      body.addShape(new CANNON.Box(new CANNON.Vec3(
        Math.max(0.05, Math.abs(scale[0] ?? 1) * collisionScale[0] * 0.5),
        isGroundSurface(entity) ? 0.05 : Math.max(0.05, Math.abs(scale[1] ?? 1) * collisionScale[1] * 0.5),
        Math.max(0.05, Math.abs(scale[2] ?? 1) * collisionScale[2] * 0.5),
      )));
    }
    const offset = entity.collision.offset ?? [0, 0, 0];
    body.position.set(
      entity.position[0] + (Number(offset[0]) || 0),
      entity.position[1] + (Number(offset[1]) || 0),
      entity.position[2] + (Number(offset[2]) || 0),
    );
    body.quaternion.setFromEuler(...(entity.rotation ?? [0, 0, 0]));
    world.addBody(body);
    world.addContactMaterial(new CANNON.ContactMaterial(playerMaterial, material, {
      friction: material.friction,
      restitution: material.restitution,
    }));
  }
}

function addGroundCollider(world, playerMaterial) {
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: new CANNON.Material('ground') });
  body.material.friction = 0;
  body.addShape(new CANNON.Box(new CANNON.Vec3(1000, 0.1, 1000)));
  body.position.set(0, -0.8, 0);
  world.addBody(body);
  world.addContactMaterial(new CANNON.ContactMaterial(playerMaterial, body.material, { friction: 0, restitution: 0 }));
}

export class PhysicsWorld {
  constructor(mapConfig = null) {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    this.playerMaterial = new CANNON.Material('player');
    this.bodies = new Map();
    this.staticColliders = (mapConfig?.entities ?? [])
      .map((entity) => getStaticColliderBounds(entity))
      .filter(Boolean);
    addStaticColliders(this.world, mapConfig, this.playerMaterial);
    addGroundCollider(this.world, this.playerMaterial);
  }

  addPlayer(id, position) {
    const body = new CANNON.Body({
      mass: 1,
      fixedRotation: true,
      allowSleep: true,
      sleepSpeedLimit: 0.05,
      sleepTimeLimit: 0.5,
    });
    body.material = this.playerMaterial;
    addCapsule(body, [0.7, 1.4, 0.7]);
    body.position.set(...position);
    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  findPath(from, to, radius = 0.35) {
    if (!collidesWithStaticColliders(from, to, radius, this.staticColliders)) return [[...to]];

    const nodes = [[...from], [...to]];
    const margin = 0.08;
    for (const collider of this.staticColliders) {
      nodes.push(
        [collider.minX - radius - margin, from[1], collider.minZ - radius - margin],
        [collider.minX - radius - margin, from[1], collider.maxZ + radius + margin],
        [collider.maxX + radius + margin, from[1], collider.minZ - radius - margin],
        [collider.maxX + radius + margin, from[1], collider.maxZ + radius + margin],
      );
    }
    return findShortestPath(nodes, this.staticColliders, radius);
  }

  stepPlayer(id, position, velocity = [0, 0, 0], deltaSeconds = 1 / 60) {
    const body = this.bodies.get(id) ?? this.addPlayer(id, position);
    const step = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1));
    body.position.set(...position);
    body.wakeUp();
    body.velocity.x = Number(velocity[0]) || 0;
    body.velocity.z = Number(velocity[2]) || 0;
    body.velocity.y = Number(body.velocity.y) || 0;
    if (step > 0) this.world.step(1 / 60, step, 8);
    return [body.position.x, body.position.y, body.position.z];
  }

  movePlayer(id, from, to, deltaSeconds = 1 / 30) {
    const step = Math.max(Number(deltaSeconds) || 0, 1 / 60);
    const velocity = [
      (to[0] - from[0]) / Math.max(deltaSeconds, 1 / 60),
      0,
      (to[2] - from[2]) / Math.max(deltaSeconds, 1 / 60),
    ];
    return this.stepPlayer(id, from, velocity, step);
  }
}
