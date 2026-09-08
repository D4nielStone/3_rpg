const DEFAULT_POSITION = [0, 0, 0];
const DEFAULT_ROTATION = [0, 0, 0];

function copyVector(vector, fallback) {
  return Array.isArray(vector) && vector.length === 3
    ? vector.map(Number)
    : [...fallback];
}

function calculateMaxXp(level) {
  return Math.ceil(level * (level / 100 + 3));
}

export class Player {
  constructor({
    peerId,
    nickname = 'Guest',
    hp = 100,
    maxHp = 100,
    mana = 100,
    maxMana = 100,
    money = 0,
    level = 1,
    xp = 0,
    maxXp,
    position = DEFAULT_POSITION,
    rotation = DEFAULT_ROTATION,
    inventory = [],
  } = {}) {
    this.peerId = peerId;
    this.nickname = nickname;
    this.hp = Number(hp);
    this.maxHp = Number(maxHp);
    this.mana = Number(mana);
    this.maxMana = Number(maxMana);
    this.money = Number(money);
    this.level = Math.max(1, Math.floor(Number(level)));
    this.xp = Number(xp);
    this.maxXp = calculateMaxXp(this.level);
    this.position = copyVector(position, DEFAULT_POSITION);
    this.rotation = copyVector(rotation, DEFAULT_ROTATION);
    this.inventory = Array.isArray(inventory) ? [...inventory] : [];
  }

  setTransform(position, rotation) {
    this.position = copyVector(position, this.position);
    this.rotation = copyVector(rotation, this.rotation);
  }

  addExperience(amount) {
    const experience = Number(amount);
    if (!Number.isFinite(experience) || experience <= 0) return false;

    this.xp += experience;
    let leveledUp = false;
    while (this.xp >= this.maxXp) {
      this.xp -= this.maxXp;
      this.level += 1;
      this.maxXp = calculateMaxXp(this.level);
      leveledUp = true;
    }
    return leveledUp;
  }

  toSnapshot() {
    return {
      peerId: this.peerId,
      nickname: this.nickname,
      hp: this.hp,
      maxHp: this.maxHp,
      mana: this.mana,
      maxMana: this.maxMana,
      money: this.money,
      level: this.level,
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