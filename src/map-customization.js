import { EnemyAreaRenderer, MeshRenderer, Transform } from './components.js';
import { createWater } from './water.js';

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

export function customizeMap(world, config = DEFAULT_MAP_CONFIG) {
  config.enemyAreas?.forEach((center) => createEnemyAreaMarker(world, center));
  if (config.water?.enabled) {
    createWater(world, config.water);
  }
}
