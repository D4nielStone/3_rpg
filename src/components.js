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

export class LineRenderer {
  constructor({ sourceEntity, color = [1, 0.85, 0.1], dashLength = 0.25, gapLength = 0.15 } = {}) {
    this.sourceEntity = sourceEntity;
    this.color = color;
    this.dashLength = dashLength;
    this.gapLength = gapLength;
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
