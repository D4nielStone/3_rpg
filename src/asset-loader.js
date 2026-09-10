import { Material, MeshRenderer, Texture } from './components.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LoadingManager } from 'three';
import { AnimationMixer, Color, Matrix3, SkinnedMesh, Vector3 } from 'three';

function parseIndex(value, length) {
  const index = Number.parseInt(value, 10);
  return index < 0 ? length + index : index - 1;
}

function dependency(dependencies, name) {
  if (!dependencies) return null;
  const rawName = decodeURIComponent(String(name)).split(/[?#]/, 1)[0];
  const key = rawName.replaceAll('\\', '/').split('/').pop().toLowerCase();
  const entry = Object.entries(dependencies).find(([dependencyName]) => (
    decodeURIComponent(String(dependencyName))
      .split(/[?#]/, 1)[0]
      .replaceAll('\\', '/')
      .split('/')
      .pop()
      .toLowerCase() === key
  ));
  return entry?.[1] ?? null;
}

export async function loadOBJ(url, textureManager = null, dependencies = null) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o modelo OBJ: ${response.status}`);
  }

  const source = await response.text();
  const materialNames = new Map();
  let mtlUrl = null;
  let mtlSource = null;
  const mtllib = source.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith('mtllib '))?.slice(7).trim();
  if (mtllib) {
    const embeddedMtl = dependency(dependencies, mtllib);
    if (embeddedMtl) mtlSource = await (await fetch(embeddedMtl)).text();
    else if (!url.startsWith('data:')) { mtlUrl = new URL(mtllib, url); mtlSource = await (await fetch(mtlUrl)).text(); }
    if (mtlSource) {
      let current = null;
      for (const rawLine of mtlSource.split(/\r?\n/)) {
        const line = rawLine.trim();
        const [command, ...values] = line.split(/\s+/);
        if (command === 'newmtl') { current = { name: values.join(' '), diffuseColor: [1, 1, 1], map: null }; materialNames.set(current.name, current); }
        else if (current && command === 'Kd') current.diffuseColor = values.slice(0, 3).map(Number);
        else if (current && command === 'map_Kd') current.map = values.join(' ');
      }
    }
  }
  const positions = [];
  const texcoords = [];
  const normals = [];
  const groups = new Map();
  let activeMaterial = 'default';
  const getGroup = () => { if (!groups.has(activeMaterial)) groups.set(activeMaterial, { vertices: [], colors: [], normals: [], uvs: [], indices: [] }); return groups.get(activeMaterial); };

  for (const line of source.split('\n')) {
    const values = line.trim().split(/\s+/);
    const command = values.shift();

    if (command === 'v') {
      positions.push(values.slice(0, 3).map(Number));
      continue;
    }
    if (command === 'vt') { texcoords.push(values.slice(0, 2).map(Number)); continue; }
    if (command === 'vn') { normals.push(values.slice(0, 3).map(Number)); continue; }
    if (command === 'usemtl') { activeMaterial = values.join(' ') || 'default'; continue; }

    if (command !== 'f' || values.length < 3) {
      continue;
    }

    const group = getGroup();
    const face = values.map((value) => {
      const [positionToken, uvToken, normalToken] = value.split('/');
      const position = positions[parseIndex(positionToken, positions.length)] ?? [0, 0, 0];
      const uv = uvToken ? texcoords[parseIndex(uvToken, texcoords.length)] : null;
      const normal = normalToken ? normals[parseIndex(normalToken, normals.length)] : null;
      const vertexIndex = group.vertices.length / 3;
      group.vertices.push(...position);
      group.colors.push(1, 1, 1);
      group.normals.push(...(normal ?? [0, 1, 0]));
      if (uv) group.uvs.push(uv[0], uv[1]);
      return vertexIndex;
    });

    for (let index = 1; index < face.length - 1; index += 1) {
      group.indices.push(face[0], face[index], face[index + 1]);
    }
  }

  const meshes = [...groups.entries()].filter(([, group]) => group.indices.length).map(([name, group]) => {
    const definition = materialNames.get(name) ?? { name, diffuseColor: [0.95, 0.55, 0.2], map: null };
    return {
      vertices: new Float32Array(group.vertices), colors: new Float32Array(group.colors), normals: new Float32Array(group.normals),
      indices: new Uint16Array(group.indices), uvs: group.uvs.length ? new Float32Array(group.uvs) : null,
      material: new Material({ diffuseColor: definition.diffuseColor, name: definition.name }),
    };
  });
  if (!meshes.length) {
    throw new Error(`O arquivo OBJ não contém uma malha válida: ${url}`);
  }

  for (const mesh of meshes) {
    const definition = materialNames.get(mesh.material.name);
    if (definition?.map) {
      const imageUrl = dependency(dependencies, definition.map) ?? (mtlUrl ? new URL(definition.map, mtlUrl) : null);
      if (!imageUrl) continue;
      const image = await new Promise((resolve, reject) => { const loaded = new Image(); loaded.onload = () => resolve(loaded); loaded.onerror = reject; loaded.src = imageUrl; });
      mesh.material.texture = new Texture({ image, name: `${mesh.material.name}-diffuse` });
      if (textureManager) mesh.material.texture.glTexture = textureManager.ensure(image, mesh.material.texture.name);
    }
  }
  return new MeshRenderer({ meshes });
}

export async function loadGLTF(url, textureManager = null, dependencies = null) {
  const manager = new LoadingManager();
  manager.setURLModifier((resourceUrl) => dependency(dependencies, resourceUrl) ?? resourceUrl);
  const loader = new GLTFLoader(manager);
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

  const meshData = [];
  const animatedMeshes = [];
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
    const material = mesh.material;
    const materialColor = material && material.color ? material.color : new Color(0.95, 0.55, 0.2);
    const colorAttribute = nonIndexed.getAttribute('color');
    const normalAttribute = nonIndexed.getAttribute('normal');
    const uvAttribute = nonIndexed.getAttribute('uv');
    const indexAttribute = nonIndexed.getIndex();

    const textureImage = material?.map?.image ?? material?.map?.source?.data;
    const texture = textureImage
      ? new Texture({ image: textureImage, name: material.name ?? `gltf-material-${meshData.length}` })
      : null;
    if (texture && textureManager) texture.glTexture = textureManager.ensure(texture.image, texture.name);
    const vertices = [];
    const colors = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < positionAttribute.count; i += 1) {
      const position = new Vector3(
        positionAttribute.getX(i),
        positionAttribute.getY(i),
        positionAttribute.getZ(i),
      );
      if (skinnedMesh) skinnedMesh.getVertexPosition(i, position);
      position.applyMatrix4(mesh.matrixWorld);
      vertices.push(
        position.x,
        position.y,
        position.z,
      );

      if (colorAttribute) {
        colors.push(
          colorAttribute.getX(i),
          colorAttribute.getY(i),
          colorAttribute.getZ(i),
        );
      } else {
        colors.push(1, 1, 1);
      }

      if (normalAttribute) {
        normals.push(
          normalAttribute.getX(i),
          normalAttribute.getY(i),
          normalAttribute.getZ(i),
        );
      } else {
        normals.push(0, 1, 0);
      }

      if (uvAttribute) {
        uvs.push(uvAttribute.getX(i), uvAttribute.getY(i));
      }
    }

    if (indexAttribute) {
      for (let i = 0; i < indexAttribute.count; i += 1) {
        indices.push(indexAttribute.getX(i));
      }
    } else {
      for (let i = 0; i < positionAttribute.count; i += 1) {
        indices.push(i);
      }
    }
    const submesh = {
      vertices: new Float32Array(vertices),
      colors: new Float32Array(colors),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices),
      uvs: uvs.length ? new Float32Array(uvs) : null,
      material: new Material({
        diffuseColor: [materialColor.r, materialColor.g, materialColor.b],
        texture,
        name: material?.name ?? `material-${meshData.length}`,
      }),
    };
    meshData.push(submesh);
    animatedMeshes.push({
      mesh,
      skinnedMesh,
      positionAttribute,
      baseNormals: new Float32Array(submesh.normals),
      submesh,
    });
  }

  if (!meshData.length || meshData.every((mesh) => mesh.vertices.length === 0 || mesh.indices.length === 0)) {
    throw new Error(`Não foi possível converter o GLTF/GLB em mesh renderizável: ${url}`);
  }

  const renderMesh = new MeshRenderer({ meshes: meshData });
  const animationUpdate = () => {
    gltf.scene.updateMatrixWorld(true);
    const position = new Vector3();
    const normalMatrix = new Matrix3();

    for (const animatedMesh of animatedMeshes) {
      const { mesh, skinnedMesh, positionAttribute, baseNormals, submesh } = animatedMesh;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);

      for (let index = 0; index < positionAttribute.count; index += 1) {
        position.fromBufferAttribute(positionAttribute, index);
        if (skinnedMesh) skinnedMesh.getVertexPosition(index, position);
        position.applyMatrix4(mesh.matrixWorld);
        submesh.vertices[index * 3] = position.x;
        submesh.vertices[index * 3 + 1] = position.y;
        submesh.vertices[index * 3 + 2] = position.z;

        const normal = new Vector3(
          baseNormals[index * 3],
          baseNormals[index * 3 + 1],
          baseNormals[index * 3 + 2],
        ).applyMatrix3(normalMatrix).normalize();
        submesh.normals[index * 3] = normal.x;
        submesh.normals[index * 3 + 1] = normal.y;
        submesh.normals[index * 3 + 2] = normal.z;
      }
      submesh.dirty = true;
    }
  };

  return {
    mesh: renderMesh,
    animations: gltf.animations,
    animationMixer: gltf.animations.length ? new AnimationMixer(gltf.scene) : null,
    animationUpdate,
  };
}

const loaders = new Map();

// Mantém os caminhos dos assets da cena fora da lógica de inicialização.
const GAME_ASSETS = {
  enemies: [''],
};

export function registerAssetLoader(format, loader) {
  loaders.set(String(format).toLowerCase(), loader);
  return loader;
}

export async function loadAsset(url, formatOverride, textureManager = null, dependencies = null) {
  const format = (formatOverride ?? url.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const loader = loaders.get(format);

  if (!loader) {
    throw new Error(`Formato de asset não suportado: ${format || 'desconhecido'} (${url})`);
  }

  const result = await loader(url, textureManager, dependencies);

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
export async function loadGameAssets(textureManager, enemyTypes = null, assetDefinitions = null) {
  const assetLoader = new AssetLoader(textureManager);
  const findAssetDefinition = (url) => assetDefinitions?.find((asset) => (
    asset.url === url || asset.source === url || asset.name === url
  ));
  const configuredTypes = Array.isArray(enemyTypes) && enemyTypes.length
    ? enemyTypes.filter((type) => type?.model).map((type) => ({
      url: type.model,
      format: type.modelFormat
        || findAssetDefinition(type.model)?.format,
      dependencies: findAssetDefinition(type.model)?.dependencies ?? null,
    }))
    : GAME_ASSETS.enemies.filter((url) => url).map((url) => ({ url }));
  const models = [...new Map(configuredTypes.map((model) => [model.url, model])).values()];
  const loaded = await Promise.all(models.map(({ url, format, dependencies }) => (
    loadAsset(url, format, textureManager, dependencies)
  )));
  const enemyAssets = new Map(models.map(({ url }, index) => [url, loaded[index]]));

  return { assetLoader, enemyAssets };
}

registerAssetLoader('obj', loadOBJ);
registerAssetLoader('gltf', loadGLTF);
registerAssetLoader('glb', loadGLTF);
registerAssetLoader('fbx', async () => {
  throw new Error('FBX ainda não está implementado no sistema de assets do ECS.');
});
