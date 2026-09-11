import { EnemyHealthBar, NameTag, Transform } from './components.js';
import { multiplyMatrices } from './math.js';

export class NameTagSystem {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.floatingDamages = [];
    this.lastUpdateAt = performance.now();
  }

  update(world, time = performance.now()) {
    const bounds = this.canvas.getBoundingClientRect();
    const deltaSeconds = Math.min((time - this.lastUpdateAt) / 1000, 0.1);
    this.lastUpdateAt = time;
    const viewProjection = multiplyMatrices(
      this.camera.getProjectionMatrix(),
      this.camera.getViewMatrix(),
    );
    const nameTagHeight = 0.5;
    for (const entity of world.query(Transform, NameTag)) {
      const transform = world.getComponent(entity, Transform);
      const nameTag = world.getComponent(entity, NameTag);
      const [x, y, z] = transform.position;
      const clipX = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
      const tagY = y + nameTagHeight;
      const clipY = viewProjection[1] * x + viewProjection[5] * tagY + viewProjection[9] * z + viewProjection[13];
      const clipZ = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
      const clipW = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
      const visible = clipW > 0 && clipZ > -clipW && clipZ < clipW;
      nameTag.element.hidden = !visible;
      if (nameTag.speechExpiresAt && nameTag.speechExpiresAt <= Date.now()) {
        nameTag.hideSpeech();
      }
      if (!visible) {
        nameTag.speechElement.hidden = true;
        continue;
      }
      const screenX = bounds.left + (clipX / clipW * 0.5 + 0.5) * bounds.width;
      const screenY = bounds.top + (-clipY / clipW * 0.5 + 0.5) * bounds.height;
      nameTag.element.style.left = `${screenX}px`;
      nameTag.element.style.top = `${screenY - 40}px`;
      nameTag.speechElement.hidden = !nameTag.speechExpiresAt;
      nameTag.speechElement.style.left = `${screenX}px`;
      nameTag.speechElement.style.top = `${screenY - 76}px`;
    }

    for (const entity of world.query(Transform, EnemyHealthBar)) {
      const transform = world.getComponent(entity, Transform);
      const healthBar = world.getComponent(entity, EnemyHealthBar);
      if (healthBar.previousHp > healthBar.hp) {
        this.spawnDamage(transform.position, healthBar.previousHp - healthBar.hp);
      }
      healthBar.previousHp = healthBar.hp;
      this.updateOverlayPosition(healthBar.element, transform.position, viewProjection, bounds, -34);
    }

    this.floatingDamages = this.floatingDamages.filter((damage) => {
      damage.age += deltaSeconds;
      if (damage.age >= 0.8) {
        damage.element.remove();
        return false;
      }
      damage.position[1] += deltaSeconds * 0.7;
      this.updateOverlayPosition(damage.element, damage.position, viewProjection, bounds, 0);
      damage.element.style.opacity = `${1 - damage.age / 0.8}`;
      return true;
    });
  }

  spawnDamage(position, amount) {
    const element = document.createElement('span');
    element.className = 'floating-damage';
    element.textContent = `-${Math.round(amount)}`;
    document.body.append(element);
    this.floatingDamages.push({
      element,
      position: [position[0], position[1] + 0.6, position[2]],
      age: 0,
    });
  }

  updateOverlayPosition(element, position, viewProjection, bounds, offset) {
    const [x, y, z] = position;
    const clipX = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
    const clipY = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
    const clipZ = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
    const clipW = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
    const visible = clipW > 0 && clipZ > -clipW && clipZ < clipW;
    element.hidden = !visible;
    if (!visible) return;
    element.style.left = `${bounds.left + (clipX / clipW * 0.5 + 0.5) * bounds.width}px`;
    element.style.top = `${bounds.top + (-clipY / clipW * 0.5 + 0.5) * bounds.height + offset}px`;
  }
}