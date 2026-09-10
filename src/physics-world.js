import * as CANNON from 'cannon-es';

function addStaticColliders(world, mapConfig) {
  for (const entity of mapConfig?.entities ?? []) {
    if (!entity.collision?.enabled) continue;
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    const scale = entity.scale ?? [1, 1, 1];
    body.addShape(new CANNON.Box(new CANNON.Vec3(
      Math.max(0.25, Math.abs(scale[0] ?? 1) * 0.5),
      Math.max(0.5, Math.abs(scale[1] ?? 1) * 0.5),
      Math.max(0.25, Math.abs(scale[2] ?? 1) * 0.5),
    )));
    body.position.set(...entity.position);
    body.quaternion.setFromEuler(...(entity.rotation ?? [0, 0, 0]));
    world.addBody(body);
  }
}

export class PhysicsWorld {
  constructor(mapConfig = null) {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });
    this.bodies = new Map();
    addStaticColliders(this.world, mapConfig);
  }

  addPlayer(id, position) {
    const body = new CANNON.Body({ mass: 1, fixedRotation: true });
    body.addShape(new CANNON.Sphere(0.35));
    body.position.set(...position);
    this.world.addBody(body);
    this.bodies.set(id, body);
    return body;
  }

  movePlayer(id, from, to, deltaSeconds = 1 / 30) {
    const body = this.bodies.get(id) ?? this.addPlayer(id, from);
    body.position.set(...from);
    body.velocity.set(
      (to[0] - from[0]) / Math.max(deltaSeconds, 1 / 60),
      0,
      (to[2] - from[2]) / Math.max(deltaSeconds, 1 / 60),
    );
    this.world.step(deltaSeconds);
    return [body.position.x, body.position.y, body.position.z];
  }
}
