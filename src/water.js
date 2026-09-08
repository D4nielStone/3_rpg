import { MeshRenderer, Transform, Water } from './components.js';

function createWaterMesh(size, segments) {
  const vertices = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const z = (v - 0.5) * size;
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const x = (u - 0.5) * size;
      vertices.push(x, 0, z);
      colors.push(1, 1, 1);
      uvs.push(u * 8, v * 8);
    }
  }

  const rowSize = segments + 1;
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const topLeft = row * rowSize + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowSize;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  return new MeshRenderer({
    vertices: new Float32Array(vertices),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices),
    uvs: new Float32Array(uvs),
  });
}

export function createWater(world, { size = 50, segments = 32 } = {}) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ position: [0, -0.08, 0] }));
  world.addComponent(entity, new Water());
  world.addComponent(entity, createWaterMesh(size, segments));
  return entity;
}