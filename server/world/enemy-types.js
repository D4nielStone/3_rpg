export const DEFAULT_ENEMY_TYPES = Object.freeze([
  {
    id: 'rat',
    name: 'Rato',
    model: '',
    modelFormat: 'glb',
    level: 1,
    maxHp: 3,
    speed: 1.2,
    defense: 1,
    damage: 1,
    experience: 2,
    scale: 0.35,
    gold: { min: 3, max: 5 },
    itemDrops: [],
  },
]);

function finite(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, number) : fallback;
}

export function normalizeEnemyType(value, index = 0) {
  const source = value && typeof value === 'object' ? value : {};
  const id = String(source.id || `enemy-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return {
    id: id || `enemy-${index + 1}`,
    name: String(source.name || id || 'Inimigo'),
    model: String(source.model || ''),
    modelFormat: String(source.modelFormat || source.format || '').toLowerCase(),
    level: Math.max(1, Math.floor(finite(source.level, 1, 1))),
    maxHp: finite(source.maxHp, 1, 1),
    speed: finite(source.speed, 1.2),
    defense: finite(source.defense, 0),
    damage: finite(source.damage, 1),
    experience: finite(source.experience, 0),
    scale: finite(source.scale, 1, 0.01),
    gold: {
      min: Math.floor(finite(source.gold?.min, 0)),
      max: Math.floor(finite(source.gold?.max, 0)),
    },
    itemDrops: Array.isArray(source.itemDrops) ? source.itemDrops.map((drop) => ({
      item: String(drop?.item || ''),
      probability: Math.min(1, Math.max(0, finite(drop?.probability, 0))),
      min: Math.floor(finite(drop?.min, 1, 1)),
      max: Math.floor(finite(drop?.max, 1, 1)),
    })).filter((drop) => drop.item) : [],
  };
}

export function createEnemyTypeMap(config) {
  const definitions = Array.isArray(config?.enemyTypes) && config.enemyTypes.length
    ? config.enemyTypes
    : DEFAULT_ENEMY_TYPES;
  return new Map(definitions.map((definition, index) => {
    const normalized = normalizeEnemyType(definition, index);
    normalized.gold.max = Math.max(normalized.gold.min, normalized.gold.max);
    return [normalized.id, normalized];
  }));
}
