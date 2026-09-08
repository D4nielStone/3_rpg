const DEFAULT_POSITION = [0, 0, 0];
const DEFAULT_ROTATION = [0, 0, 0];

function copyVector(vector, fallback) {
  return Array.isArray(vector) && vector.length === 3
    ? vector.map(Number)
    : [...fallback];
}

export class Player {
  constructor({
    peerId,
    hp = 100,
    maxHp = 100,
    mana = 100,
    maxMana = 100,
    money = 0,
    xp = 0,
    maxXp = 100,
    position = DEFAULT_POSITION,
    rotation = DEFAULT_ROTATION,
    inventory = [],
  } = {}) {
    this.peerId = peerId;
    this.hp = Number(hp);
    this.maxHp = Number(maxHp);
    this.mana = Number(mana);
    this.maxMana = Number(maxMana);
    this.money = Number(money);
    this.xp = Number(xp);
    this.maxXp = Number(maxXp);
    this.position = copyVector(position, DEFAULT_POSITION);
    this.rotation = copyVector(rotation, DEFAULT_ROTATION);
    this.inventory = Array.isArray(inventory) ? [...inventory] : [];
  }

  setTransform(position, rotation) {
    this.position = copyVector(position, this.position);
    this.rotation = copyVector(rotation, this.rotation);
  }

  toSnapshot() {
    return {
      peerId: this.peerId,
      hp: this.hp,
      maxHp: this.maxHp,
      mana: this.mana,
      maxMana: this.maxMana,
      money: this.money,
      xp: this.xp,
      maxXp: this.maxXp,
      position: [...this.position],
      rotation: [...this.rotation],
      inventory: [...this.inventory],
    };
  }

  toPersistence() {
    const { peerId, ...persistentState } = this.toSnapshot();
    return persistentState;
  }
}