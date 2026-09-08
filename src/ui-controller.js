function attributePercent(value) {
  return `${Math.min(100, Math.max(0, Number(value) * 10))}%`;
}

export function createUiController({
  menuButton,
  attributesMenu,
  rankingButton,
  rankingMenu,
  rankingList,
  combatModeButtons,
  chatToggle,
  chatElement,
  onlinePlayersPanel,
  onlinePlayersList,
  strengthValue,
  accuracyValue,
  magicValue,
  strengthBar,
  accuracyBar,
  magicBar,
}) {
  function closeMenus() {
    attributesMenu.classList.add('attributes-menu-hidden');
    rankingMenu.classList.add('attributes-menu-hidden');
    menuButton.setAttribute('aria-expanded', 'false');
    rankingButton.setAttribute('aria-expanded', 'false');
  }

  function toggleAttributes() {
    const isOpen = attributesMenu.classList.toggle('attributes-menu-hidden') === false;
    rankingMenu.classList.add('attributes-menu-hidden');
    rankingButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  }

  function toggleRanking() {
    const isOpen = rankingMenu.classList.toggle('attributes-menu-hidden') === false;
    attributesMenu.classList.add('attributes-menu-hidden');
    menuButton.setAttribute('aria-expanded', 'false');
    rankingButton.setAttribute('aria-expanded', String(isOpen));
    return isOpen;
  }

  function toggleChat() {
    const isOpen = chatElement.hidden;
    chatElement.hidden = !isOpen;
    chatToggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) document.querySelector('#chat-input').focus();
  }

  function updateAttributes({ strength, strengthXp, maxStrengthXp, accuracy, magic }) {
    strengthValue.textContent = `${strength} (${strengthXp}/${maxStrengthXp})`;
    accuracyValue.textContent = String(accuracy);
    magicValue.textContent = String(magic);
    strengthBar.style.width = attributePercent(strength);
    accuracyBar.style.width = attributePercent(accuracy);
    magicBar.style.width = attributePercent(magic);
  }

  function updateCombatMode(mode) {
    combatModeButtons.forEach((button) => {
      button.classList.toggle('combat-mode-selected', button.dataset.combatMode === mode);
    });
  }

  function renderOnlinePlayers(players = []) {
    onlinePlayersList.replaceChildren();
    players.forEach((player) => {
      const item = document.createElement('li');
      const nickname = document.createElement('span');
      const level = document.createElement('strong');
      nickname.textContent = player.nickname ?? 'Guest';
      level.textContent = `LVL ${player.level ?? 1}`;
      item.append(nickname, level);
      onlinePlayersList.append(item);
    });
  }

  function renderRanking(players = []) {
    rankingList.replaceChildren();
    players.forEach((player, index) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const score = document.createElement('strong');
      name.textContent = `${index + 1}. ${player.nickname ?? 'Guest'}`;
      score.textContent = `LVL ${player.level} | XP ${player.xp}`;
      item.append(name, score);
      rankingList.append(item);
    });
  }

  menuButton.addEventListener('click', toggleAttributes);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      onlinePlayersPanel.classList.toggle('online-players-hidden');
      return;
    }
    if (event.key === 'Escape') closeMenus();
  });

  return {
    toggleChat,
    toggleRanking,
    updateAttributes,
    updateCombatMode,
    renderOnlinePlayers,
    renderRanking,
  };
}
