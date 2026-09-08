import { randomUUID } from 'node:crypto';

const ENEMY_TYPES = {
  rat: {
    name: 'Rato',
    model: '/models/rat/scene.gltf',
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
    this.moveSpeed = 1.25;
    this.alerted = false;

    this.position = [...position];
    this.rotationY = 0;
  }

  updateChase(players, deltaSeconds) {
    let target = null;
    let targetDistance = this.detectionRadius;

    for (const player of players) {
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

    if (!target || targetDistance === 0) return;

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
