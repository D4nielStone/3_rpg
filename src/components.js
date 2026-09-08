export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
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
    this.fill = document.createElement('span');
    this.element.append(this.fill);
    document.body.append(this.element);
    this.update(hp, maxHp);
  }

  update(hp, maxHp = this.maxHp) {
    this.hp = Math.max(0, Number(hp) || 0);
    this.maxHp = Math.max(1, Number(maxHp) || 1);
    this.fill.style.width = `${Math.min(100, this.hp / this.maxHp * 100)}%`;
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
