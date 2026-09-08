import { MeshRenderer, Transform } from './components.js';
import { createWater } from './water.js';
import { readSavedMapConfig } from './map-config.js';

export const DEFAULT_MAP_CONFIG = Object.freeze({
  enemyAreas: [
    { center: [0, 0, 0], width: 25, depth: 25 },
    { center: [35, 0, 0], width: 25, depth: 25 },
  ],
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

export function customizeMap(world, config = null) {
  const activeConfig = config ?? readSavedMapConfig() ?? DEFAULT_MAP_CONFIG;
  createTerrain(world, activeConfig.terrain);
  if (activeConfig.water?.enabled && !activeConfig.terrain?.cells) {
    createWater(world, activeConfig.water);
  }
}
