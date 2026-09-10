import { randomUUID } from 'node:crypto';
import { createEnemyTypeMap } from './world/enemy-types.js';

export class Enemy {
  constructor({ id = randomUUID(), type = 'rat', level, position = [0, 0, 0], definitions = null } = {}) {
    const definition = (definitions ?? createEnemyTypeMap()).get(type);
    if (!definition) throw new Error(`Tipo de inimigo desconhecido: ${type}`);

    this.id = id;
    this.type = type;
    this.name = definition.name;
    this.model = definition.model;
    this.level = Math.max(1, Number(level) || definition.level);
    this.hp = definition.maxHp;
    this.maxHp = definition.maxHp;
    this.defense = Math.max(0, Number(definition.defense) || 0);
    this.experience = definition.experience;
    this.goldMin = definition.gold.min;
    this.goldMax = definition.gold.max;
    this.itemDrops = definition.itemDrops;
    this.sizeMultiplier = definition.scale;

    this.detectionRadius = 6;
    this.attackRange = 1;
    this.attackDamage = definition.damage;
    this.attackCooldown = 0;
    this.moveSpeed = definition.speed;
    this.alerted = false;
    this.targetPeerId = null;
    this.wanderTarget = null;
    this.wanderPause = 0;

    this.position = [...position];
    this.rotationY = 0;
    this.scale = this.sizeMultiplier;
  }

  updateChase(players, deltaSeconds, area = null) {
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaSeconds);
    this.scale = this.sizeMultiplier * (Math.sin(Date.now() * 0.0005 + 1) * 0.05 + 0.95);
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

    if (!target) {
      this.alerted = false;
      this.updateWander(deltaSeconds, area);
      return;
    }

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

  updateWander(deltaSeconds, area) {
    if (!area) return;

    if (this.wanderPause > 0) {
      this.wanderPause = Math.max(0, this.wanderPause - deltaSeconds);
      return;
    }

    const distanceToTarget = this.wanderTarget
      ? Math.hypot(
        this.wanderTarget[0] - this.position[0],
        this.wanderTarget[2] - this.position[2],
      )
      : Infinity;

    if (this.wanderTarget && distanceToTarget < 0.2) {
      this.wanderTarget = null;
      this.wanderPause = 0.8 + Math.random() * 1.7;
      return;
    }

    if (!this.wanderTarget) {
      this.wanderTarget = [
        area.center[0] + (Math.random() - 0.5) * area.width,
        this.position[1],
        area.center[2] + (Math.random() - 0.5) * area.depth,
      ];
    }

    const deltaX = this.wanderTarget[0] - this.position[0];
    const deltaZ = this.wanderTarget[2] - this.position[2];
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance === 0) return;

    this.rotationY = Math.atan2(deltaX, deltaZ);
    const step = Math.min(this.moveSpeed * deltaSeconds, distance);
    this.position[0] += deltaX / distance * step;
    this.position[2] += deltaZ / distance * step;
  }

  receiveDamage(amount) {
    const rawDamage = Number(amount);
    if (!Number.isFinite(rawDamage) || rawDamage <= 0 || this.hp <= 0) return false;

    const damage = Math.max(0, rawDamage - this.defense);
    this.hp = Math.max(0, this.hp - damage);
    return damage;
  }

  setTarget(player) {
    this.targetPeerId = player.peerId;
    this.alerted = true;
  }

  getDrop() {
    const items = this.itemDrops.filter((drop) => Math.random() <= drop.probability).map((drop) => ({
      item: drop.item,
      quantity: Math.floor(drop.min + Math.random() * (drop.max - drop.min + 1)),
    }));
    return {
      experience: this.experience,
      gold: Math.floor(this.goldMin + Math.random() * (this.goldMax - this.goldMin + 1)),
      items,
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
      defense: this.defense,
      alerted: this.alerted,
      position: [...this.position],
      rotationY: this.rotationY,
      scale: this.scale,
    };
  }
}
