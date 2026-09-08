export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
  }
}

import { LoopOnce, LoopRepeat } from 'three';

export class AnimationPlayer {
  constructor({ animations = {}, mixer = null, onUpdate = null, initialAnimation = null, speed = 1 } = {}) {
    this.animations = Array.isArray(animations)
      ? Object.fromEntries(animations.map((animation) => [animation.name, animation]))
      : animations;
    this.mixer = mixer;
    this.onUpdate = onUpdate;
    this.action = null;
    this.currentAnimation = null;
    this.elapsed = 0;
    this.speed = Math.max(0, Number(speed) || 0);
    this.playing = false;
    const firstAnimation = initialAnimation ?? Object.keys(this.animations)[0];
    if (firstAnimation !== undefined) this.play(firstAnimation);
  }

  play(name, { loop = true, reset = true } = {}) {
    const animation = this.animations[name];
    if (!animation) return false;
    this.currentAnimation = name;
    this.loop = loop;
    if (reset) this.elapsed = 0;
    if (this.mixer) {
      this.action?.stop();
      this.action = this.mixer.clipAction(animation);
      this.action.reset();
      this.action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      this.action.clampWhenFinished = !loop;
      this.action.play();
    }
    this.playing = true;
    return true;
  }

  pause() {
    this.playing = false;
  }

  resume() {
    if (this.currentAnimation) this.playing = true;
  }

  stop() {
    this.action?.stop();
    this.playing = false;
    this.elapsed = 0;
  }

  update(deltaSeconds, transform, updatedMixers = null) {
    if (!this.playing || this.currentAnimation === null) return;
    const animation = this.animations[this.currentAnimation];
    if (this.mixer) {
      if (!updatedMixers || !updatedMixers.has(this.mixer)) {
        this.mixer.update(deltaSeconds * this.speed);
        updatedMixers?.add(this.mixer);
      }
      this.onUpdate?.();
      return;
    }
    const duration = Math.max(0, Number(animation.duration) || 0);
    this.elapsed += deltaSeconds * this.speed;

    if (duration > 0 && this.elapsed >= duration) {
      if (this.loop) this.elapsed %= duration;
      else {
        this.elapsed = duration;
        this.playing = false;
      }
    }

    animation.apply?.({
      elapsed: this.elapsed,
      progress: duration > 0 ? this.elapsed / duration : 0,
      transform,
    });
  }

  dispose() {
    this.action?.stop();
    this.mixer?.stopAllAction();
  }
}

export class PlayerController {
  constructor({ speed = 3 } = {}) {
    this.speed = speed;
  }
}

export class MoveTarget {
  constructor() {
    this.position = null;
  }
}

export class NetworkIdentity {
  constructor({ peerId, isLocal = false } = {}) {
    this.peerId = peerId;
    this.isLocal = isLocal;
  }
}

export class NetworkTransform {
  constructor({ interpolation = 14 } = {}) {
    this.targetPosition = null;
    this.targetRotation = null;
    this.interpolation = interpolation;
  }
}

export class NameTag {
  constructor({ text = 'Guest', level = 1, alerted = false } = {}) {
    this.text = text;
    this.level = level;
    this.alerted = alerted;
    this.element = document.createElement('span');
    this.element.className = 'player-name-tag';
    this.update(text, level, alerted);
    document.body.append(this.element);
  }

  update(text = this.text, level = this.level, alerted = this.alerted) {
    this.text = text;
    this.level = Math.max(1, Number(level) || 1);
    this.alerted = Boolean(alerted);
    this.element.textContent = `${this.alerted ? '! ' : ''}${this.text} • LVL ${this.level}`;
    this.element.classList.toggle('player-name-tag-alerted', this.alerted);
  }

  dispose() {
    this.element.remove();
  }
}

export class EnemyIdentity {
  constructor({ enemyId, type = 'rat' } = {}) {
    this.enemyId = enemyId;
    this.type = type;
  }
}

export class EnemyHealthBar {
  constructor({ hp = 1, maxHp = 1 } = {}) {
    this.hp = hp;
    this.maxHp = maxHp;
    this.element = document.createElement('div');
    this.element.className = 'enemy-healthbar';
    this.element.setAttribute('role', 'progressbar');
    this.fill = document.createElement('span');
    this.element.append(this.fill);
    document.body.append(this.element);
    this.update(hp, maxHp);
  }

  update(hp, maxHp = this.maxHp) {
    this.hp = Math.max(0, Number(hp) || 0);
    this.maxHp = Math.max(1, Number(maxHp) || 1);
    const percentage = Math.min(100, this.hp / this.maxHp * 100);
    this.fill.style.width = `${percentage}%`;
    this.element.setAttribute('aria-valuenow', String(this.hp));
    this.element.setAttribute('aria-valuemax', String(this.maxHp));
  }

  dispose() {
    this.element.remove();
  }
}

export class OutlineRenderer {
  constructor({ radius = 0.65, thickness = 0.08, color = [0.84, 0.66, 0.24], segments = 24 } = {}) {
    this.radius = radius;
    this.thickness = thickness;
    this.color = color;
    this.segments = segments;
    this.active = false;
    this.vertices = new Float32Array();
    this.colors = new Float32Array();
    this.indices = new Uint16Array();
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.indexBuffer = null;
    this.dirty = true;
  }
}

export class Texture {
  constructor({
    image = null,
    source = null,
    wrapS = 'CLAMP_TO_EDGE',
    wrapT = 'CLAMP_TO_EDGE',
    minFilter = 'LINEAR',
    magFilter = 'LINEAR',
    name = 'texture',
  } = {}) {
    this.image = image ?? source ?? null;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    this.minFilter = minFilter;
    this.magFilter = magFilter;
    this.name = name;
    this.glTexture = null;
  }
}

export class MeshRenderer {
  constructor({ vertices, colors, indices, uvs = null, texture = null }) {
    this.vertices = vertices;
    this.colors = colors;
    this.indices = indices;
    this.uvs = uvs;
    this.texture = texture;
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.indexBuffer = null;
    this.uvBuffer = null;
    this.dirty = false;
  }
}

export class Water {
  constructor({ color = [0.08, 0.45, 0.72] } = {}) {
    this.color = color;
  }
}

export class LineRenderer {
  // radius controla o tamanho; thickness controla a largura do anel.
  constructor({
    sourceEntity,
    color = [0.1, 0.45, 1],
    radius = 0.35,
    thickness = 0.06,
    segments = 32,
  } = {}) {
    this.sourceEntity = sourceEntity;
    this.color = color;
    this.radius = radius;
    this.thickness = thickness;
    this.segments = segments;
    this.target = null;
    this.vertices = new Float32Array();
    this.colors = new Float32Array();
    this.indices = new Uint16Array();
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.indexBuffer = null;
    this.dirty = true;
  }
}
