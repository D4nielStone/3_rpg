import { EnemyIdentity, SoundListener, SoundPlayer, Transform } from './components.js';
import { MultiplayerSystem } from './multiplayer.js';
import { addRemotePlayer } from './player-factory.js';
import { createGame } from './game-setup.js';
import { startGameLoop } from './game-loop.js';
import { ChatPanel } from './chat.js';
import { PlayerStatus } from './player-status.js';
import { addRemoteEnemy } from './enemy-factory.js';
import { loadGameAssets } from './asset-loader.js';
import { createUiController } from './ui-controller.js';
import { createAccountController } from './account-controller.js';
import { getMultiplayerHttpUrl, getMultiplayerUrl } from './multiplayer-url.js';
import { DEFAULT_MAP_CONFIG } from './map-customization.js';
import { readSavedMapConfig } from './map-config.js';
import {
  addMovementMarker,
  addPlayerNameTag,
  followPlayer,
  loadLocalPlayer,
} from './scene-helpers.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');
const loadingScreen = document.querySelector('#loading-screen');
const loadingTitle = document.querySelector('#loading-title');
const loadingMessage = document.querySelector('#loading-message');
const startScreen = document.querySelector('#start-screen');
const accountForm = document.querySelector('#account-form');
const guestButton = document.querySelector('#guest-button');
const nicknameInput = document.querySelector('#nickname');
const accountMessage = document.querySelector('#account-message');
const registerButton = document.querySelector('#register-button');
const deathScreen = document.querySelector('#death-screen');
const respawnButton = document.querySelector('#respawn-button');
const menuButton = document.querySelector('#menu-button');
const attributesMenu = document.querySelector('#attributes-menu');
const combatModeButtons = [...document.querySelectorAll('[data-combat-mode]')];
const rankingButton = document.querySelector('#ranking-button');
const rankingMenu = document.querySelector('#ranking-menu');
const chatToggle = document.querySelector('#chat-toggle');
const chatElement = document.querySelector('#chat');
const logoutButton = document.querySelector('#logout-button');

// Atualiza o texto do loading screen
function updateLoading(message, title = 'Carregando cena') {
  loadingTitle.textContent = title;
  loadingMessage.textContent = message;
}
// Esconde o loading screen
function finishLoading() {
  loadingScreen.classList.add('loading-screen-hidden');
  loadingScreen.setAttribute('aria-hidden', 'true');
}

// Retorna o json do mapa
async function loadPublishedMapConfig() {
  const httpUrl = getMultiplayerHttpUrl();
  try {
    const response = await fetch(`${httpUrl}/api/map-config`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Servidor multiplayer indisponível (HTTP ${response.status}).`);
    }
    const config = await response.json();
    return Array.isArray(config.enemyAreas) ? config : null;
  } catch (error) {
    const savedConfig = readSavedMapConfig();
    if (Array.isArray(savedConfig?.enemyAreas)) return savedConfig;
    return DEFAULT_MAP_CONFIG;
  }
}

// Cria o controlador de UI, que gerencia menus, atributos e ranking
const ui = createUiController({
  menuButton,
  attributesMenu,
  rankingButton,
  rankingMenu,
  rankingList: document.querySelector('#ranking-list'),
  combatModeButtons,
  chatToggle,
  chatElement,
  onlinePlayersPanel: document.querySelector('#online-players-panel'),
  onlinePlayersList: document.querySelector('#online-players-list'),
  strengthValue: document.querySelector('#player-strength-value'),
  accuracyValue: document.querySelector('#player-accuracy-value'),
  magicValue: document.querySelector('#player-magic-value'),
  strengthBar: document.querySelector('#player-strength-bar'),
  accuracyBar: document.querySelector('#player-accuracy-bar'),
  magicBar: document.querySelector('#player-magic-bar'),
});

// Cria o painel de status do jogador, que mostra HP, mana, XP, nível e ouro
const playerStatus = new PlayerStatus({
  root: document.querySelector('#player-status'),
  nicknameValue: document.querySelector('#player-nickname-value'),
  adminBadge: document.querySelector('#player-admin-badge'),
  hpValue: document.querySelector('#player-hp-value'),
  hpBar: document.querySelector('#player-hp-bar'),
  manaBar: document.querySelector('#player-mana-bar'),
  xpBar: document.querySelector('#player-xp-bar'),
  levelValue: document.querySelector('#player-level-value'),
  xpValue: document.querySelector('#player-xp-value'),
  goldValue: document.querySelector('#player-gold-value'),
  strengthValue: document.querySelector('#player-status-strength-value'),
  accuracyValue: document.querySelector('#player-status-accuracy-value'),
  magicValue: document.querySelector('#player-status-magic-value'),
  combatModeValue: document.querySelector('#player-combat-mode-value'),
});

// Inicializa o status do jogador com valores padrão
playerStatus.update({ level: 1, hp: 20, maxHp: 20, mana: 20, maxMana: 20, xp: 0, maxXp: 4 });
function updatePlayerAttributes({ strength = 1, strengthXp = 0, maxStrengthXp = 1, accuracy = 1, magic = 1 } = {}) {
  ui.updateAttributes({ strength, strengthXp, maxStrengthXp, accuracy, magic });
}


// Inicializa o modo de combate com valor padrão
let combatMode = 'melee';
function updateCombatMode(mode = 'melee') {
  combatMode = mode;
  ui.updateCombatMode(mode);
}

// Cria sons de ataque para diferentes tipos de ataques
function createAttackSound(type) {
  return (context) => {
    const duration = type === 'pulse' ? 0.22 : 0.14;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    const settings = {
      slash: { start: 620, end: 120, noise: 0.18 },
      pulse: { start: 180, end: 520, noise: 0.04 },
      arc: { start: 260, end: 920, noise: 0.08 },
      'level-up': { start: 440, end: 880, noise: 0.02 },
    }[type];
    if (!settings) return buffer;
    for (let index = 0; index < samples.length; index += 1) {
      const progress = index / samples.length;
      const envelope = Math.pow(1 - progress, 2);
      const frequency = settings.start + (settings.end - settings.start) * progress;
      samples[index] = (
        Math.sin(2 * Math.PI * frequency * index / context.sampleRate)
        + (Math.random() * 2 - 1) * settings.noise
      ) * envelope * 0.35;
    }
    return buffer;
  };
}

updatePlayerAttributes();
updateCombatMode();
// O chat e a cena sao inicializados uma unica vez; os sistemas fazem o trabalho por frame.
const chat = new ChatPanel({
  messagesElement: document.querySelector('#chat-messages'),
  formElement: document.querySelector('#chat-form'),
  inputElement: document.querySelector('#chat-input'),
});

chatToggle.addEventListener('click', () => {
  ui.toggleChat();
});

function createMultiplayer(game, playerEntity, enemyAssets, soundPlayer) {
  // Em producao, a URL vem do Render; localmente usamos o relay na porta 5174.
  const multiplayerUrl = getMultiplayerUrl();
  const guestId = getGuestId();
  const url = multiplayerUrl ? new URL(multiplayerUrl) : null;
  url?.searchParams.set('guestId', guestId);
  url?.searchParams.set('nickname', window.localStorage.getItem('webgl-rpg-nickname') ?? 'Guest');
  const multiplayer = new MultiplayerSystem({
    url: url?.toString() ?? '',
    world: game.world,
    input: game.input,
    onStatus: (message) => {
      status.textContent = `${message} Clique para mover; Space cancela.`;
    },
    onPlayerState: (player) => {
      playerStatus.update(player);
      updatePlayerAttributes(player);
      updateCombatMode(player.combatMode);
      status.textContent = `Área: ${player.area?.name ?? 'Área dos Ratos'} (Nível ${player.area?.level ?? 1}). Clique para mover; Space cancela.`;
    },
    onDeath: () => deathScreen.classList.remove('death-screen-hidden'),
    onRespawn: () => deathScreen.classList.add('death-screen-hidden'),
    onRanking: ui.renderRanking,
    onOnlinePlayers: ui.renderOnlinePlayers,
    onMapAccess: (path) => window.open(new URL(path, window.location.origin), '_blank', 'noopener'),
    onChat: (message) => chat.addMessage(message),
    onAttackHit: () => {
      const soundName = { melee: 'slash', ranged: 'pulse', magic: 'arc' }[combatMode] ?? 'slash';
      soundPlayer?.play(soundName).catch(() => {});
    },
    onLevelUp: () => {
      soundPlayer?.play('level-up').catch(() => {});
      const transform = game.world.getComponent(playerEntity, Transform);
      if (transform) game.nameTagSystem.spawnLevelUp(transform.position);
    },
    createRemoteEntity: (peerId, nickname, level) => addRemotePlayer(game.world, playerEntity, peerId, nickname, level),
    createEnemyEntity: (enemy) => addRemoteEnemy(game.world, enemyAssets, enemy),
    onAttackTargetChanged: (entity) => game.PlayerPathSystem.setCombatTarget(entity),
  });
  chat.connect((message) => multiplayer.sendChat(message));
  combatModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      updateCombatMode(button.dataset.combatMode);
      multiplayer.setCombatMode(button.dataset.combatMode);
    });
  });
  rankingButton.addEventListener('click', () => {
    if (ui.toggleRanking()) multiplayer.requestRanking();
  });
  multiplayer.setLocalEntity(playerEntity);
  return multiplayer;
}

/**
 * @param {import('./texture-manager.js').TextureManager} - textureManager
 * @param {Array} - enemyTypes
 * @param {Object} - assetDefinitions
 * @returns {Promise<{enemyAssets: Object}>}
 */
async function loadSceneAssets(textureManager, enemyTypes, assetDefinitions) {
  // O main controla apenas o estado visual; o catálogo fica no asset-loader.
  updateLoading('Carregando modelos de inimigos...');
  return loadGameAssets(textureManager, enemyTypes, assetDefinitions);
}

function getGuestId() {
  const storageKey = 'webgl-rpg-guest-id';
  const savedGuestId = window.localStorage.getItem(storageKey);
  if (savedGuestId) return savedGuestId;

  const guestId = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, guestId);
  return guestId;
}

// Inicia o jogo, carregando a cena, o jogador local e conectando ao multiplayer
/**
 * @param {Object} identity - Objeto contendo informações do jogador (nickname e isAdmin).
 * @param {string} identity.nickname - O nickname do jogador.
 * @param {boolean} identity.isAdmin - Indica se o jogador é administrador.
 */
async function start(identity = {}) {
  // Atualiza o status do jogador com o nickname e se é admin
  playerStatus.update({
    nickname: identity.nickname ?? 'Guest',
    isAdmin: identity.isAdmin === true,
  });

  // Atualiza o loading screen para indicar que está verificando a conexão com o multiplayer
  updateLoading('Verificando conexão com o multiplayer...', 'Conectando ao jogo');
  status.textContent = 'Verificando conexão com o multiplayer...';

  updateLoading('Preparando o mundo...');
  status.textContent = 'Carregando cena...';
  const mapConfig = await loadPublishedMapConfig();
  const game = await createGame(canvas, status, mapConfig);
  updateLoading('Carregando cenário e personagem...');
  const { entity: playerEntity, usedFallback } = await loadLocalPlayer(game, mapConfig?.player, mapConfig?.assets);
  const soundListener = new SoundListener();
  game.world.addComponent(playerEntity, soundListener);
  game.world.addComponent(playerEntity, new SoundPlayer({
    sounds: {
        slash: mapConfig?.sounds?.slash || createAttackSound('slash'),
        pulse: mapConfig?.sounds?.pulse || createAttackSound('pulse'),
        arc: mapConfig?.sounds?.arc || createAttackSound('arc'),
        'level-up': mapConfig?.sounds?.['level-up'] || createAttackSound('level-up'),
    },
    volume: 0.7,
  }));
  const soundPlayer = game.world.getComponent(playerEntity, SoundPlayer);
  const { enemyAssets } = await loadSceneAssets(game.textureManager, mapConfig?.enemyTypes, mapConfig?.assets);
  addPlayerNameTag(game.world, playerEntity);

  updateLoading('Finalizando cena...');
  // Configura o sistema de seguir o jogador e adiciona um marcador de movimento
  followPlayer(game, playerEntity);
  addMovementMarker(game.world, playerEntity);



  // Configura o sistema de multiplayer, incluindo respawn e ataque a inimigos
  const multiplayerSystem = createMultiplayer(game, playerEntity, enemyAssets, soundPlayer);
  respawnButton.addEventListener('click', () => multiplayerSystem.sendRespawn());
  game.enemyHoverSystem.onSelect = (entity) => {
    if (entity && game.world.getComponent(entity, EnemyIdentity)) {
      multiplayerSystem.setAttackTarget(entity);
      multiplayerSystem.sendAttack();
      return;
    }
    multiplayerSystem.setAttackTarget(null);
  };

  updateLoading('Aguardando conexão com o multiplayer...', 'Conectando ao jogo');
  await multiplayerSystem.connect();
  status.textContent = usedFallback
    ? 'Modelo 3D indisponível; usando modelo de fallback.'
    : 'WebGL ativo: clique para mover. Espaço cancela o destino.';
  finishLoading();
  startGameLoop({ ...game, multiplayerSystem });
}

function handleStartError(error) {
  updateLoading(error.message, 'Não foi possível carregar');
  loadingScreen.classList.add('loading-screen-error');
  status.textContent = `Erro ao iniciar: ${error.message}`;
  console.error(error);
}

createAccountController({
  startScreen,
  accountForm,
  guestButton,
  registerButton,
  nicknameInput,
  passwordInput: document.querySelector('#password'),
  messageElement: accountMessage,
  logoutButton,
  startGame: (identity) => start(identity).catch(handleStartError),
});
