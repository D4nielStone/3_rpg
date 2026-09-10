import { AnimationPlayer, MeshRenderer, ShadowRenderer, Texture, Transform } from './components.js';
import { loadAsset } from './asset-loader.js';
import { createWater } from './water.js';
import { readSavedMapConfig } from './map-config.js';

export const DEFAULT_MAP_CONFIG = Object.freeze({
  enemyAreas: [],
  water: {
    enabled: false,
    size: 50,
    segments: 32,
    level: -0.2,
  },
});

const TERRAIN_COLORS = {
  grass: [0.247, 0.529, 0.282],
  water: [0.157, 0.482, 0.627],
  stone: [0.467, 0.49, 0.475],
  enemy: [0.435, 0.357, 0.192],
};

function createPrimitiveMesh(type) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const segments = 24;
  const addVertex = (position, normal, uv) => {
    positions.push(...position);
    normals.push(...normal);
    uvs.push(...uv);
    return positions.length / 3 - 1;
  };
  const addQuad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  const addBox = () => {
    const faces = [
      [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
      [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
      [[1, 0, 0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]],
      [[-1, 0, 0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]],
      [[0, 1, 0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]],
      [[0, -1, 0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]],
    ];
    faces.forEach(([normal, corners]) => {
      const first = corners.map((corner, index) => addVertex(corner, normal, [index === 1 || index === 2 ? 1 : 0, index >= 2 ? 1 : 0]));
      addQuad(...first);
    });
  };
  if (type === 'box') addBox();
  else if (type === 'plane') {
    const first = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]].map((corner, index) => addVertex(corner, [0, 1, 0], [index === 1 || index === 2 ? 1 : 0, index >= 2 ? 1 : 0]));
    addQuad(...first);
  } else {
    const isCone = type === 'cone';
    const isCapsule = type === 'capsule';
    const rings = isCapsule ? 10 : 1;
    const ringIndices = [];
    for (let ring = 0; ring <= rings; ring += 1) {
      const t = ring / rings;
      const y = isCapsule ? -0.5 + t : -0.5 + t;
      const radius = isCone ? 0.5 * (1 - t) : 0.5;
      ringIndices.push(Array.from({ length: segments }, (_, index) => {
        const angle = index / segments * Math.PI * 2;
        return addVertex([Math.cos(angle) * radius, y, Math.sin(angle) * radius], [Math.cos(angle), isCone ? 0.5 : 0, Math.sin(angle)], [index / segments, t]);
      }));
    }
    for (let ring = 0; ring < rings; ring += 1) for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      addQuad(ringIndices[ring][index], ringIndices[ring][next], ringIndices[ring + 1][next], ringIndices[ring + 1][index]);
    }
    if (!isCapsule) {
      const bottom = addVertex([0, -0.5, 0], [0, -1, 0], [0.5, 0.5]);
      const top = addVertex([0, 0.5, 0], [0, 1, 0], [0.5, 0.5]);
      for (let index = 0; index < segments; index += 1) {
        const next = (index + 1) % segments;
        indices.push(bottom, ringIndices[0][next], ringIndices[0][index], top, ringIndices[rings][index], ringIndices[rings][next]);
      }
    }
  }
  if (!positions.length) return null;
  return new MeshRenderer({
    meshes: [{
      vertices: new Float32Array(positions),
      colors: new Float32Array(Array.from({ length: positions.length }, () => 1)),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices),
      material: { diffuseColor: [0.49, 0.71, 1], texture: null },
    }],
  });
}

function createTerrain(world, terrain) {
  const columns = Number(terrain?.columns);
  const rows = Number(terrain?.rows);
  const cells = terrain?.cells;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || !Array.isArray(cells)) return;

  const vertices = [];
  const colors = [];
  const indices = [];
  const halfColumns = columns / 2;
  const halfRows = rows / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const terrainType = cells[row]?.[column] === 'enemy' ? 'grass' : cells[row]?.[column];
      const color = TERRAIN_COLORS[terrainType] ?? TERRAIN_COLORS.grass;
      const x = column - halfColumns;
      const z = row - halfRows;
      const first = vertices.length / 3;
      const level = terrainType === 'water' ? -0.2 : -0.08;
      vertices.push(
        x, level, z,
        x + 1, level, z,
        x + 1, level, z + 1,
        x, level, z + 1,
      );
      colors.push(...color, ...color, ...color, ...color);
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }

  const entity = world.createEntity();
  world.addComponent(entity, new Transform());
  world.addComponent(entity, new MeshRenderer({
    vertices: new Float32Array(vertices),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices),
  }));
}

/** Esta função cria as entidades do mundo com base na configuração fornecida. */
async function createWorldEntities(world, config, textureManager) {
  // Cria um mapa de assets para facilitar a busca por ID
  const assets = new Map((config.assets ?? []).map((asset) => [asset.id, asset]));
  // Cria as entidades do mundo com base na configuração fornecida
  for (const definition of config.entities ?? []) {
    if (definition.primitive) {
      const mesh = createPrimitiveMesh(definition.primitive);
      if (!mesh) continue;
      const entity = world.createEntity();
      world.addComponent(entity, new Transform({
        position: definition.position,
        rotation: definition.rotation,
        scale: definition.scale,
      }));
      const material = mesh.meshes[0]?.material;
      mesh.receiveLight = definition.receiveLight !== false;
      mesh.castShadow = definition.castShadow !== false;
      const configuredMaterial = definition.materials?.[0]?.diffuseColor;
      if (Array.isArray(configuredMaterial)) material.diffuseColor = [...configuredMaterial];
      world.addComponent(entity, mesh);
      if (definition.castShadow !== false) world.addComponent(entity, new ShadowRenderer());
      continue;
    }
    const asset = assets.get(definition.assetId);
    if (!asset?.url || asset.url.startsWith('blob:') || asset.url.startsWith('local:')) continue;
    try {
      const loaded = await loadAsset(asset.url, asset.format, textureManager, asset.dependencies);
      const entity = world.createEntity();
      world.addComponent(entity, new Transform({
        position: definition.position,
        rotation: definition.rotation,
        scale: definition.scale,
      }));
      (definition.materials ?? []).forEach((materialDefinition, index) => {
        const material = loaded.mesh.meshes[index]?.material;
        if (material && Array.isArray(materialDefinition.diffuseColor)) material.diffuseColor = [...materialDefinition.diffuseColor];
      });
      loaded.mesh.receiveLight = definition.receiveLight !== false;
      loaded.mesh.castShadow = definition.castShadow !== false;
      world.addComponent(entity, loaded.mesh);
      if (definition.castShadow !== false) world.addComponent(entity, new ShadowRenderer());
      if (loaded.texture) world.addComponent(entity, loaded.texture);
      if (loaded.animations?.length) {
        console.log(`Adicionando animações para a entidade ${entity}:`, loaded.animations.map(a => a.name));
        let ap = world.addComponent(entity, new AnimationPlayer({
          animations: loaded.animations,
          mixer: loaded.animationMixer,
          onUpdate: loaded.animationUpdate,
        }));
        for (const animation of loaded.animations) {
          console.log(`Animação disponível: ${animation.name}`);
          console.log(`Duração: ${animation.duration} segundos`);
          console.log(`Número de quadros: ${animation.tracks.length}`);
        }
        // Se houver uma animação padrão definida, reproduza-a
        ap.play(loaded.animations[0].name, {loop: true});
      }
    } catch {
      // Um asset ausente não deve impedir o carregamento do restante do mundo.
    }
  }
}

export function customizeMap(world, config = null, textureManager = null) {
  const activeConfig = config ?? readSavedMapConfig() ?? DEFAULT_MAP_CONFIG;
  createTerrain(world, activeConfig.terrain);
  if (activeConfig.water?.enabled && !activeConfig.terrain?.cells) {
    createWater(world, activeConfig.water);
  }
  if (textureManager && Array.isArray(activeConfig.entities)) {
    createWorldEntities(world, activeConfig, textureManager);
  }
}
