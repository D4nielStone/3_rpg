import { Enemy } from './enemy.js';

export class EnemyArea {
  constructor({
    id,
    center = [0, 0, 0],
    width = 25,
    depth = 25,
    maxEnemies = 5,
    enemyType = 'rat',
    spawnIntervalMs = 3000,
  } = {}) {
    this.id = id;
    this.center = [...center];
    this.width = width;
    this.depth = depth;
    this.maxEnemies = maxEnemies;
    this.enemyType = enemyType;
    this.spawnIntervalMs = spawnIntervalMs;
    this.enemies = new Map();
    this.lastSpawnAt = 0;
  }

  update(time, players = [], deltaSeconds = 1) {
    let changed = false;
    const activePlayers = [...players];
    for (const enemy of this.enemies.values()) {
      const previousPosition = [...enemy.position];
      const previousAlerted = enemy.alerted;
      enemy.updateChase(activePlayers, deltaSeconds);
      changed = changed
        || previousAlerted !== enemy.alerted
        || previousPosition[0] !== enemy.position[0]
        || previousPosition[2] !== enemy.position[2];
    }

    if (this.enemies.size < this.maxEnemies && time - this.lastSpawnAt >= this.spawnIntervalMs) {
      const enemy = new Enemy({
        type: this.enemyType,
        position: this.randomPosition(),
      });
      this.enemies.set(enemy.id, enemy);
      this.lastSpawnAt = time;
      changed = true;
    }
    return changed;
  }

  randomPosition() {
    return [
      this.center[0] + (Math.random() - 0.5) * this.width,
      this.center[1],
      this.center[2] + (Math.random() - 0.5) * this.depth,
    ];
  }

  removeEnemy(enemyId) {
    return this.enemies.delete(enemyId);
  }

  toSnapshots() {
    return [...this.enemies.values()].map((enemy) => ({
      ...enemy.toSnapshot(),
      areaId: this.id,
    }));
  }
}