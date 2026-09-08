export class PlayerStatus {
  constructor({ root, hpValue, hpBar, manaBar, xpBar, levelValue, goldValue }) {
    this.root = root;
    this.hpValue = hpValue;
    this.hpBar = hpBar;
    this.manaBar = manaBar;
    this.xpBar = xpBar;
    this.levelValue = levelValue;
    this.goldValue = goldValue;
  }

  update({ level = 1, hp = 0, maxHp = 1, mana = 0, maxMana = 1, xp = 0, maxXp = 1, money = 0 } = {}) {
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
    this.levelValue.textContent = `LVL ${Math.max(1, Number(level))} | XP ${currentXp}/${currentMaxXp}`;
    this.goldValue.textContent = currentMoney.toLocaleString('pt-BR');
    this.root.hidden = false;
  }
}