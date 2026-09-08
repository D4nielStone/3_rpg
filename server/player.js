const DEFAULT_POSITION = [0, 0, 0];
const DEFAULT_ROTATION = [0, 0, 0];

const BASIC_SWORD = {
  id: 'basic-sword',
  name: 'Espada Básica',
  type: 'weapon',
  slot: 'main',
  level: 1,
  damage: 1,
  speed: 1,
};

function copyVector(vector, fallback) {
  return Array.isArray(vector) && vector.length === 3
    ? vector.map(Number)
    : [...fallback];
}

function calculateMaxXp(level) {
  return Math.ceil(level * (level / 100 + 3));
}

function calculateMeleeXp(level) {
  return level ** 2 * 5;
}

const BLOOD_HIT_WINDOW_MS = 7000;

function calculateMaxAttribute(baseValue, level) {
  return Math.round(baseValue * 1.2 ** (level - 1));
}

export class Player {
  constructor({
    peerId,
    nickname = 'Guest',
    hp = 20,
    mana = 20,
    money = 0,
    strength = 1,
    strengthXp = 0,
    accuracy = 1,
    magic = 1,
    combatMode = 'melee',
    area = { id: 'starting-rat-area', name: 'Área dos Ratos', level: 1 },
    level = 1,
    xp = 0,
    maxXp,
    position = DEFAULT_POSITION,
    rotation = DEFAULT_ROTATION,
    inventory,
  } = {}) {
    this.peerId = peerId;
    this.nickname = nickname;
    this.money = Number(money);
    this.strength = Math.max(1, Number(strength) || 1);
    this.strengthXp = Math.max(0, Number(strengthXp) || 0);
    this.maxStrengthXp = calculateMeleeXp(this.strength);
    this.lastBloodHitAt = 0;
    this.accuracy = Math.max(1, Number(accuracy) || 1);
    this.magic = Math.max(1, Number(magic) || 1);
    this.combatMode = ['melee', 'ranged', 'magic'].includes(combatMode)
      ? combatMode
      : 'melee';
    this.area = { ...area };
    this.level = Math.max(1, Math.floor(Number(level)));
    this.maxHp = calculateMaxAttribute(20, this.level);
    this.maxMana = calculateMaxAttribute(20, this.level);
    this.hp = Math.min(this.maxHp, Math.max(0, Number(hp)));
    this.dead = this.hp <= 0;
    this.mana = Math.min(this.maxMana, Math.max(0, Number(mana)));
    this.xp = Number(xp);
    this.maxXp = calculateMaxXp(this.level);
    this.position = copyVector(position, DEFAULT_POSITION);
    this.rotation = copyVector(rotation, DEFAULT_ROTATION);
    const storedInventory = Array.isArray(inventory) ? inventory : [];
    this.inventory = storedInventory.length > 0
      ? [...storedInventory]
      : [{ ...BASIC_SWORD }];
  }

  setTransform(position, rotation) {
    this.position = copyVector(position, this.position);
    this.rotation = copyVector(rotation, this.rotation);
  }

  getMainWeapon() {
    return this.inventory.find((item) => item.type === 'weapon' && item.slot === 'main')
      ?? null;
  }

  setCombatMode(mode) {
    if (!['melee', 'ranged', 'magic'].includes(mode)) return false;
    this.combatMode = mode;
    return true;
  }

  canAttack(now) {
    const weapon = this.getMainWeapon();
    if (!weapon || weapon.speed <= 0) return false;

    const cooldown = 1000 / weapon.speed;
    if (now - (this.lastAttackAt ?? 0) < cooldown) return false;

    this.lastAttackAt = now;
    return true;
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
      this.maxHp = calculateMaxAttribute(20, this.level);
      this.maxMana = calculateMaxAttribute(20, this.level);
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      leveledUp = true;
    }
    return leveledUp;
  }

  loseExperiencePercent(percent) {
    const loss = Math.min(100, Math.max(0, Number(percent) || 0));
    let totalExperience = this.xp;
    for (let level = 1; level < this.level; level += 1) {
      totalExperience += calculateMaxXp(level);
    }

    totalExperience = Math.floor(totalExperience * (1 - loss / 100));
    this.level = 1;
    this.xp = totalExperience;
    this.maxXp = calculateMaxXp(this.level);
    while (this.xp >= this.maxXp) {
      this.xp -= this.maxXp;
      this.level += 1;
      this.maxXp = calculateMaxXp(this.level);
    }

    this.maxHp = calculateMaxAttribute(20, this.level);
    this.maxMana = calculateMaxAttribute(20, this.level);
    this.hp = Math.min(this.hp, this.maxHp);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  addStrengthExperience(amount) {
    const experience = Number(amount);
    if (!Number.isFinite(experience) || experience <= 0) return false;

    this.strengthXp += experience;
    let leveledUp = false;
    while (this.strengthXp >= this.maxStrengthXp) {
      this.strengthXp -= this.maxStrengthXp;
      this.strength += 1;
      this.maxStrengthXp = calculateMeleeXp(this.strength);
      leveledUp = true;
    }
    return leveledUp;
  }

  registerMeleeAttack(realDamage, now, ticks = 1) {
    if (realDamage > 0) this.lastBloodHitAt = now;
    if (!this.lastBloodHitAt || now - this.lastBloodHitAt > BLOOD_HIT_WINDOW_MS) {
      return false;
    }
    return this.addStrengthExperience(ticks);
  }

  die() {
    if (this.dead) return false;
    this.hp = 0;
    this.money = 0;
    this.loseExperiencePercent(45);
    this.dead = true;
    return true;
  }

  respawn() {
    this.hp = this.maxHp;
    this.dead = false;
    this.position = [...DEFAULT_POSITION];
    this.rotation = [...DEFAULT_ROTATION];
  }

  toSnapshot() {
    return {
      peerId: this.peerId,
      nickname: this.nickname,
      hp: this.hp,
      dead: this.dead,
      maxHp: this.maxHp,
      mana: this.mana,
      maxMana: this.maxMana,
      money: this.money,
      strength: this.strength,
      strengthXp: this.strengthXp,
      maxStrengthXp: this.maxStrengthXp,
      accuracy: this.accuracy,
      magic: this.magic,
      combatMode: this.combatMode,
      area: { ...this.area },
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