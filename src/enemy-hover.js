import { OutlineRenderer, Transform } from './components.js';

export class EnemyHoverSystem {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.pointer = null;

    canvas.addEventListener('pointermove', (event) => {
      this.pointer = [event.clientX, event.clientY];
    });

    canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
  }

  update(world) {
    const pointerPosition = this.pointer
      ? this.camera.screenToGround(
          this.pointer[0],
          this.pointer[1],
          this.canvas,
        )
      : null;

    let closestEntity = null;
    let closestDistance = Infinity;

    if (pointerPosition) {
      for (const entity of world.query(Transform, OutlineRenderer)) {
        const transform = world.getComponent(entity, Transform);
        const outline = world.getComponent(entity, OutlineRenderer);

        const distance = Math.hypot(
          pointerPosition[0] - transform.position[0],
          pointerPosition[2] - transform.position[2],
        );

        if (
          distance <= outline.radius &&
          distance < closestDistance
        ) {
          closestEntity = entity;
          closestDistance = distance;
        }
      }
    }

    for (const entity of world.query(OutlineRenderer)) {
      const outline = world.getComponent(entity, OutlineRenderer);

      const active = entity === closestEntity;

      if (outline.active !== active) {
        outline.active = active;
        outline.dirty = true;
      }
    }
  }
}
