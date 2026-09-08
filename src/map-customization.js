import { EnemyAreaRenderer, MeshRenderer, Transform } from './components.js';
import { createWater } from './water.js';
import { readSavedMapConfig } from './map-config.js';

export const DEFAULT_MAP_CONFIG = Object.freeze({
  enemyAreas: [
    [0, 0, 0],
    [35, 0, 0],
  ],
  water: {
    enabled: false,
    size: 50,
    segments: 32,
  },
});

function createEnemyAreaMarker(world, center) {
  const entity = world.createEntity();
  world.addComponent(entity, new Transform({ position: [center[0], -0.04, center[2]] }));
  world.addComponent(entity, new EnemyAreaRenderer());
  world.addComponent(entity, new MeshRenderer({
    vertices: new Float32Array([
      -12.5, 0, -12.5, 12.5, 0, -12.5,
      12.5, 0, 12.5, -12.5, 0, 12.5,
    ]),
    colors: new Float32Array([
      0.015, 0.06, 0.16, 0.015, 0.06, 0.16,
      0.015, 0.06, 0.16, 0.015, 0.06, 0.16,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  }));
}

const TERRAIN_COLORS = {
  grass: [0.247, 0.529, 0.282],
  water: [0.157, 0.482, 0.627],
  stone: [0.467, 0.49, 0.475],
  enemy: [0.435, 0.357, 0.192],
};

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
      const color = TERRAIN_COLORS[cells[row]?.[column]] ?? TERRAIN_COLORS.grass;
      const x = column - halfColumns;
      const z = row - halfRows;
      const first = vertices.length / 3;
      vertices.push(
        x, -0.08, z,
        x + 1, -0.08, z,
        x + 1, -0.08, z + 1,
        x, -0.08, z + 1,
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

export function customizeMap(world, config = DEFAULT_MAP_CONFIG) {
  const savedConfig = readSavedMapConfig();
  const activeConfig = savedConfig ? { ...config, ...savedConfig } : config;
  createTerrain(world, activeConfig.terrain);
  activeConfig.enemyAreas?.forEach((center) => createEnemyAreaMarker(world, center));
  if (activeConfig.water?.enabled && !activeConfig.terrain?.cells) {
    createWater(world, activeConfig.water);
  }
}
