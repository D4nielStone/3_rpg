export class PlayerStatus {
  constructor({
    root,
    nicknameValue,
    adminBadge,
    levelValue,
    hpValue,
    hpBar,
    manaBar,
    xpBar,
    xpValue,
    goldValue,
    strengthValue,
    accuracyValue,
    magicValue,
    combatModeValue,
  }) {
    this.root = root;
    this.nicknameValue = nicknameValue;
    this.adminBadge = adminBadge;
    this.levelValue = levelValue;
    this.hpValue = hpValue;
    this.hpBar = hpBar;
    this.manaBar = manaBar;
    this.xpBar = xpBar;
    this.xpValue = xpValue;
    this.goldValue = goldValue;
    this.strengthValue = strengthValue;
    this.accuracyValue = accuracyValue;
    this.magicValue = magicValue;
    this.combatModeValue = combatModeValue;
  }

  update({
    nickname = 'Guest',
    level = 1,
    hp = 0,
    maxHp = 1,
    mana = 0,
    maxMana = 1,
    xp = 0,
    maxXp = 1,
    money = 0,
    strength = 1,
    strengthXp = 0,
    maxStrengthXp = 1,
    accuracy = 1,
    magic = 1,
    combatMode = 'melee',
    isAdmin = false,
  } = {}) {
    const currentHp = Math.max(0, Number(hp));
    const currentMaxHp = Math.max(1, Number(maxHp));
    const currentMana = Math.max(0, Number(mana));
    const currentMaxMana = Math.max(1, Number(maxMana));
    const currentXp = Math.max(0, Number(xp));
    const currentMaxXp = Math.max(1, Number(maxXp));
    const currentMoney = Math.max(0, Number(money));

    this.hpValue.textContent = `${currentHp}/${currentMaxHp}`;
    this.hpBar.style.width = `${Math.min(100, currentHp / currentMaxHp * 100)}%`;
    this.manaBar.style.width = `${Math.min(100, currentMana / currentMaxMana * 100)}%`;
    this.xpBar.style.width = `${Math.min(100, currentXp / currentMaxXp * 100)}%`;
    this.nicknameValue.textContent = nickname;
    this.adminBadge.hidden = !isAdmin;
    this.levelValue.textContent = String(Math.max(1, Number(level)));
    this.xpValue.textContent = `${currentXp}/${currentMaxXp}`;
    this.goldValue.textContent = currentMoney.toLocaleString('pt-BR');
    this.strengthValue.textContent = `${strength} (${strengthXp}/${maxStrengthXp})`;
    this.accuracyValue.textContent = String(accuracy);
    this.magicValue.textContent = String(magic);
    this.combatModeValue.textContent = {
      melee: 'Corpo-a-corpo',
      ranged: 'Distância',
      magic: 'Magia',
    }[combatMode] ?? combatMode;
    this.root.hidden = false;
  }
}