export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
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
