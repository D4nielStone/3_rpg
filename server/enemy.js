import { randomUUID } from 'node:crypto';

const ENEMY_TYPES = {
  rat: {
    name: 'Rato',
    model: '/models/test/source/AmongUS[Red].glb',
    level: 1,
    maxHp: 25,
    experience: 8,
    goldMin: 3,
    goldMax: 5,
  },
};

export class Enemy {
  constructor({ id = randomUUID(), type = 'rat', position = [0, 0, 0] } = {}) {
    const definition = ENEMY_TYPES[type];
    if (!definition) throw new Error(`Tipo de inimigo desconhecido: ${type}`);

    this.id = id;
    this.type = type;
    this.name = definition.name;
    this.model = definition.model;
    this.level = definition.level;
    this.hp = definition.maxHp;
    this.maxHp = definition.maxHp;
    this.experience = definition.experience;
    this.goldMin = definition.goldMin;
    this.goldMax = definition.goldMax;

    this.detectionRadius = 6;
    this.attackRange = 1;
    this.attackDamage = 5;
    this.attackCooldown = 0;
    this.moveSpeed = 1.25;
    this.alerted = false;
    this.targetPeerId = null;

    this.position = [...position];
    this.rotationY = 0;
  }

  updateChase(players, deltaSeconds) {
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaSeconds);
    let target = players.find((player) =>
      !player.dead && player.peerId === this.targetPeerId) ?? null;
    let targetDistance = target
      ? Math.hypot(
        target.position[0] - this.position[0],
        target.position[2] - this.position[2],
      )
      : this.detectionRadius;

    for (const player of players) {
      if (target) break;
      if (player.dead) continue;
      const distance = Math.hypot(
        player.position[0] - this.position[0],
        player.position[2] - this.position[2],
      );

      if (distance <= targetDistance) {
        target = player;
        targetDistance = distance;
      }
    }

    this.alerted = Boolean(target);

    if (!target) return;

    if (targetDistance <= this.attackRange) {
      if (this.attackCooldown === 0 && target.hp > 0) {
        target.hp = Math.max(0, target.hp - this.attackDamage);
        this.attackCooldown = 1;
        return { damagedPlayer: target };
      }
      return;
    }

    if (targetDistance === 0) return;

    const directionX =
      (target.position[0] - this.position[0]) / targetDistance;

    const directionZ =
      (target.position[2] - this.position[2]) / targetDistance;

    // Rotação horizontal para apontar para o jogador
    this.rotationY = Math.atan2(directionX, directionZ);

    const step = Math.min(
      this.moveSpeed * deltaSeconds,
      targetDistance
    );

    this.position[0] += directionX * step;
    this.position[2] += directionZ * step;
  }

  receiveDamage(amount) {
    const damage = Number(amount);
    if (!Number.isFinite(damage) || damage <= 0 || this.hp <= 0) return false;

    this.hp = Math.max(0, this.hp - damage);
    return true;
  }

  setTarget(player) {
    this.targetPeerId = player.peerId;
    this.alerted = true;
  }

  getDrop() {
    return {
      experience: this.experience,
      gold: Math.floor(this.goldMin + Math.random() * (this.goldMax - this.goldMin + 1)),
    };
  }

  toSnapshot() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      model: this.model,
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      alerted: this.alerted,
      position: [...this.position],
      rotationY: this.rotationY,
    };
  }
}
