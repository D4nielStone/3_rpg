export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
  }
}

export class MeshRenderer {
  constructor({ vertices, colors, indices }) {
    this.vertices = vertices;
    this.colors = colors;
    this.indices = indices;
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.indexBuffer = null;
  }
}
