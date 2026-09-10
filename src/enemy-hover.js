import { OutlineRenderer, Transform } from './components.js';

// Sistema de detecção de mouse-hover no inimigo.
export class EnemyHoverSystem {
  constructor(canvas, camera, onSelect = () => {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.onSelect = onSelect;
    this.pointer = null;
    this.pendingClick = null;

    canvas.addEventListener('pointermove', (event) => {
      this.pointer = [event.clientX, event.clientY];
    });

    canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.pendingClick = [event.clientX, event.clientY];
    });
  }

  update(world) {
    const pointerPosition = this.pointer
      ? this.camera.screenToGround(this.pointer[0], this.pointer[1], this.canvas)
      : null;

    const closestEntity = this.findClosestEntity(world, pointerPosition);

    // Verifica se o click pegou no inimigo
    if (this.pendingClick) {
      const [x, y] = this.pendingClick;
      const clickPosition = this.camera.screenToGround(x, y, this.canvas);
      this.onSelect(this.findClosestEntity(world, clickPosition));
      this.pendingClick = null;
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

  findClosestEntity(world, pointerPosition) {
    let closestEntity = null;
    let closestDistance = Infinity;
    if (!pointerPosition) return null;

    for (const entity of world.query(Transform, OutlineRenderer)) {
      const transform = world.getComponent(entity, Transform);
      const outline = world.getComponent(entity, OutlineRenderer);
      const distance = Math.hypot(
        pointerPosition[0] - transform.position[0],
        pointerPosition[2] - transform.position[2],
      );
      if (distance <= outline.radius && distance < closestDistance) {
        closestEntity = entity;
        closestDistance = distance;
      }
    }
    return closestEntity;
  }
}
