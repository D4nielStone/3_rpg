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
    const damagedPlayers = [];
    const deadPlayers = [];
    const activePlayers = [...players];
    for (const enemy of this.enemies.values()) {
      const previousPosition = [...enemy.position];
      const previousAlerted = enemy.alerted;
      const result = enemy.updateChase(activePlayers, deltaSeconds);
      if (result?.damagedPlayer) damagedPlayers.push(result.damagedPlayer);
      changed = changed
        || previousAlerted !== enemy.alerted
        || previousPosition[0] !== enemy.position[0]
        || previousPosition[2] !== enemy.position[2];
    }

    for (const player of activePlayers) {
      if (player.hp <= 0 && player.die()) deadPlayers.push(player);
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
    return {
      changed: changed || damagedPlayers.length > 0 || deadPlayers.length > 0,
      damagedPlayers,
      deadPlayers,
    };
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

  attack(player, now) {
    const weapon = player.getMainWeapon();
    if (!weapon) return { hit: false };

    let target = null;
    let targetDistance = 1;
    for (const enemy of this.enemies.values()) {
      const distance = Math.hypot(
        player.position[0] - enemy.position[0],
        player.position[2] - enemy.position[2],
      );
      if (distance <= targetDistance) {
        target = enemy;
        targetDistance = distance;
      }
    }

    if (!target || !player.canAttack(now)) return { hit: false };

    target.setTarget(player);
    target.receiveDamage(weapon.damage);
    if (target.hp <= 0) {
      this.removeEnemy(target.id);
      return { hit: true, rewards: target.getDrop() };
    }
    return { hit: true };
  }

  toSnapshots() {
    return [...this.enemies.values()].map((enemy) => ({
      ...enemy.toSnapshot(),
      areaId: this.id,
    }));
  }
}