import { NameTag, Transform } from './components.js';
import { multiplyMatrices } from './math.js';

export class NameTagSystem {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
  }

  update(world) {
    const bounds = this.canvas.getBoundingClientRect();
    const viewProjection = multiplyMatrices(
      this.camera.getProjectionMatrix(),
      this.camera.getViewMatrix(),
    );

    for (const entity of world.query(Transform, NameTag)) {
      const transform = world.getComponent(entity, Transform);
      const nameTag = world.getComponent(entity, NameTag);
      const [x, y, z] = transform.position;
      const clipX = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
      const clipY = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
      const clipZ = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
      const clipW = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
      const visible = clipW > 0 && clipZ > -clipW && clipZ < clipW;
      nameTag.element.hidden = !visible;
      if (!visible) continue;
      nameTag.element.style.left = `${bounds.left + (clipX / clipW * 0.5 + 0.5) * bounds.width}px`;
      nameTag.element.style.top = `${bounds.top + (-clipY / clipW * 0.5 + 0.5) * bounds.height - 18}px`;
    }
  }
}