import { EnemyArea } from '../enemy-area.js';

export const MIN_LEVEL_FOR_HIGHER_AREA = 3;

export function createEnemyAreas(config = null) {
  const definitions = Array.isArray(config?.enemyAreas) ? config.enemyAreas : [];
  return definitions.map((area, index) => new EnemyArea({
    id: area.id ?? (index === 0 ? 'starting-rat-area' : `map-area-${index + 1}`),
    center: area.center,
    width: area.width,
    depth: area.depth,
    maxEnemies: area.maxEnemies ?? 5,
    enemyType: area.enemyType ?? 'rat',
    areaLevel: area.areaLevel ?? Math.min(index + 1, 2),
    spawnIntervalMs: area.spawnIntervalMs ?? 3000,
  }));
}

export function isValidMapConfig(config) {
  if (!config || typeof config !== 'object') return false;
  const enemyAreasValid = config.enemyAreas === undefined
    || (Array.isArray(config.enemyAreas) && config.enemyAreas.every((area) => area && typeof area === 'object'
      && Array.isArray(area.center)
      && area.center.length === 3
      && area.center.every((value) => Number.isFinite(value))
      && Number.isFinite(area.width) && area.width > 0
      && Number.isFinite(area.depth) && area.depth > 0));
  const waterValid = config.water === undefined
    || (config.water && typeof config.water.enabled === 'boolean');
  return Array.isArray(config.assets)
    && Array.isArray(config.entities)
    && enemyAreasValid
    && waterValid;
}

export function isWaterPosition(position, mapConfig) {
  const terrain = mapConfig?.terrain;
  if (Number.isInteger(terrain?.columns) && Number.isInteger(terrain?.rows)) {
    const column = Math.floor(position[0] + terrain.columns / 2);
    const row = Math.floor(position[2] + terrain.rows / 2);
    return terrain.cells?.[row]?.[column] === 'water';
  }
  const water = mapConfig?.water;
  if (!water?.enabled) return false;
  const size = Number(water.size) || 50;
  return Math.abs(position[0]) <= size / 2 && Math.abs(position[2]) <= size / 2;
}