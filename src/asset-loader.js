import { MeshRenderer, Texture } from './components.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer, Color, SkinnedMesh, Vector3 } from 'three';

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

export async function loadGLTF(url, textureManager = null) {
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
  const mergedUVs = [];
  const animationEntries = [];
  let vertexOffset = 0;
  let texture = null;
  gltf.scene.updateMatrixWorld(true);

  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    const nonIndexed = geometry.toNonIndexed();
    const positionAttribute = nonIndexed.getAttribute('position');

    if (!positionAttribute) {
      continue;
    }

    const skinnedMesh = mesh.isSkinnedMesh
      ? new SkinnedMesh(nonIndexed, mesh.material)
      : null;
    if (skinnedMesh) {
      skinnedMesh.bind(mesh.skeleton, mesh.bindMatrix);
    }
    animationEntries.push({ mesh, positionAttribute, skinnedMesh, vertexOffset });

    const material = mesh.material;
    const materialColor = material && material.color ? material.color : new Color(0.95, 0.55, 0.2);
    const colorAttribute = nonIndexed.getAttribute('color');
    const uvAttribute = nonIndexed.getAttribute('uv');
    const indexAttribute = nonIndexed.getIndex();

    if (!texture && material && material.map && material.map.image) {
      texture = new Texture({ image: material.map.image, name: 'gltf-material' });
      if (textureManager && texture.image) {
        texture.glTexture = textureManager.ensure(texture.image, texture.name);
      }
    }

    for (let i = 0; i < positionAttribute.count; i += 1) {
      const position = new Vector3(
        positionAttribute.getX(i),
        positionAttribute.getY(i),
        positionAttribute.getZ(i),
      );
      if (skinnedMesh) skinnedMesh.getVertexPosition(i, position);
      position.applyMatrix4(mesh.matrixWorld);
      mergedVertices.push(
        position.x,
        position.y,
        position.z,
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

      if (uvAttribute) {
        mergedUVs.push(uvAttribute.getX(i), uvAttribute.getY(i));
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

  const renderMesh = new MeshRenderer({
      vertices: new Float32Array(mergedVertices),
      colors: new Float32Array(mergedColors),
      indices: new Uint16Array(mergedIndices),
      uvs: mergedUVs.length ? new Float32Array(mergedUVs) : null,
      texture,
  });

  const animationUpdate = () => {
    gltf.scene.updateMatrixWorld(true);
    const position = new Vector3();
    for (const entry of animationEntries) {
      for (let index = 0; index < entry.positionAttribute.count; index += 1) {
        position.set(
          entry.positionAttribute.getX(index),
          entry.positionAttribute.getY(index),
          entry.positionAttribute.getZ(index),
        );
        if (entry.skinnedMesh) entry.skinnedMesh.getVertexPosition(index, position);
        position.applyMatrix4(entry.mesh.matrixWorld);
        const offset = (entry.vertexOffset + index) * 3;
        renderMesh.vertices[offset] = position.x;
        renderMesh.vertices[offset + 1] = position.y;
        renderMesh.vertices[offset + 2] = position.z;
      }
    }
    renderMesh.dirty = true;
  };

  return {
    mesh: renderMesh,
    texture,
    animations: gltf.animations,
    animationMixer: gltf.animations.length ? new AnimationMixer(gltf.scene) : null,
    animationUpdate,
  };
}

const loaders = new Map();

// Mantém os caminhos dos assets da cena fora da lógica de inicialização.
const GAME_ASSETS = {
  enemies: ['/models/test/source/AmongUS[Red].glb'],
};

export function registerAssetLoader(format, loader) {
  loaders.set(String(format).toLowerCase(), loader);
  return loader;
}

export async function loadAsset(url, formatOverride, textureManager = null) {
  const format = (formatOverride ?? url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const loader = loaders.get(format);

  if (!loader) {
    throw new Error(`Formato de asset não suportado: ${format || 'desconhecido'} (${url})`);
  }

  const result = await loader(url, textureManager);

  if (result instanceof MeshRenderer) {
    return { mesh: result, texture: null };
  }

  if (result && typeof result === 'object' && result.mesh instanceof MeshRenderer) {
    return result;
  }

  if (result && typeof result === 'object') {
    return { mesh: result, texture: null };
  }

  throw new Error(`Loader retornou um valor inválido para: ${url}`);
}

export class AssetLoader {
  constructor(textureManager) {
    this.textureManager = textureManager;
    this.cache = new Map();
  }

  async load(url, formatOverride) {
    // Reutiliza a mesma Promise para evitar downloads duplicados do asset.
    if (!this.cache.has(url)) {
      this.cache.set(url, loadAsset(url, formatOverride, this.textureManager));
    }
    return this.cache.get(url);
  }

  async loadMany(urls) {
    const assets = await Promise.all(urls.map((url) => this.load(url)));
    return new Map(urls.map((url, index) => [url, assets[index]]));
  }
}

// Carrega os assets compartilhados pela cena e os agrupa por categoria.
export async function loadGameAssets(textureManager) {
  const assetLoader = new AssetLoader(textureManager);
  const enemyAssets = await assetLoader.loadMany(GAME_ASSETS.enemies);

  return { assetLoader, enemyAssets };
}

registerAssetLoader('obj', loadOBJ);
registerAssetLoader('gltf', loadGLTF);
registerAssetLoader('glb', loadGLTF);
registerAssetLoader('fbx', async () => {
  throw new Error('FBX ainda não está implementado no sistema de assets do ECS.');
});
