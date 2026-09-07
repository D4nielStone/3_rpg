import { MeshRenderer } from './components.js';

function parseIndex(value, length) {
  const index = Number.parseInt(value, 10);
  return index < 0 ? length + index : index - 1;
}

export async function loadOBJ(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o modelo OBJ: ${response.status}`);
  }

  const source = await response.text();
  const positions = [];
  const vertices = [];
  const colors = [];
  const indices = [];

  for (const line of source.split('\n')) {
    const values = line.trim().split(/\s+/);
    const command = values.shift();

    if (command === 'v') {
      positions.push(values.slice(0, 3).map(Number));
      continue;
    }

    if (command !== 'f' || values.length < 3) {
      continue;
    }

    const face = values.map((value) => {
      const positionIndex = parseIndex(value.split('/')[0], positions.length);
      const position = positions[positionIndex];
      const vertexIndex = vertices.length / 3;
      vertices.push(...position);
      colors.push(0.95, 0.55, 0.2);
      return vertexIndex;
    });

    for (let index = 1; index < face.length - 1; index += 1) {
      indices.push(face[0], face[index], face[index + 1]);
    }
  }

  if (vertices.length === 0 || indices.length === 0) {
    throw new Error(`O arquivo OBJ não contém uma malha válida: ${url}`);
  }

  return new MeshRenderer({
    vertices: new Float32Array(vertices),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices),
  });
}
