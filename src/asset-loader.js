import { MeshRenderer } from './components.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Color } from 'three';

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

export async function loadGLTF(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const meshes = [];

  gltf.scene.traverse((node) => {
    if (node.isMesh) {
      meshes.push(node);
    }
  });

  if (meshes.length === 0) {
    throw new Error(`O arquivo GLTF/GLB não contém malhas válidas: ${url}`);
  }

  const mergedVertices = [];
  const mergedColors = [];
  const mergedIndices = [];
  let vertexOffset = 0;

  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const nonIndexed = geometry.toNonIndexed();
    const positionAttribute = nonIndexed.getAttribute('position');

    if (!positionAttribute) {
      continue;
    }

    const materialColor = mesh.material && mesh.material.color
      ? mesh.material.color
      : new Color(0.95, 0.55, 0.2);
    const colorAttribute = nonIndexed.getAttribute('color');
    const indexAttribute = nonIndexed.getIndex();

    for (let i = 0; i < positionAttribute.count; i += 1) {
      mergedVertices.push(
        positionAttribute.getX(i),
        positionAttribute.getY(i),
        positionAttribute.getZ(i),
      );

      if (colorAttribute) {
        mergedColors.push(
          colorAttribute.getX(i),
          colorAttribute.getY(i),
          colorAttribute.getZ(i),
        );
      } else {
        mergedColors.push(materialColor.r, materialColor.g, materialColor.b);
      }
    }

    if (indexAttribute) {
      for (let i = 0; i < indexAttribute.count; i += 1) {
        mergedIndices.push(indexAttribute.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < positionAttribute.count; i += 1) {
        mergedIndices.push(i + vertexOffset);
      }
    }

    vertexOffset += positionAttribute.count;
  }

  if (mergedVertices.length === 0 || mergedIndices.length === 0) {
    throw new Error(`Não foi possível converter o GLTF/GLB em mesh renderizável: ${url}`);
  }

  return new MeshRenderer({
    vertices: new Float32Array(mergedVertices),
    colors: new Float32Array(mergedColors),
    indices: new Uint16Array(mergedIndices),
  });
}

const loaders = new Map();

export function registerAssetLoader(format, loader) {
  loaders.set(String(format).toLowerCase(), loader);
  return loader;
}

export async function loadAsset(url, formatOverride) {
  const format = (formatOverride ?? url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const loader = loaders.get(format);

  if (!loader) {
    throw new Error(`Formato de asset não suportado: ${format || 'desconhecido'} (${url})`);
  }

  const result = await loader(url);

  if (result instanceof MeshRenderer) {
    return result;
  }

  if (result && typeof result === 'object') {
    return result;
  }

  throw new Error(`Loader retornou um valor inválido para: ${url}`);
}

registerAssetLoader('obj', loadOBJ);
registerAssetLoader('gltf', loadGLTF);
registerAssetLoader('glb', loadGLTF);
registerAssetLoader('fbx', async () => {
  throw new Error('FBX ainda não está implementado no sistema de assets do ECS.');
});
