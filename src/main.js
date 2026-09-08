import { LineRenderer, Transform } from './components.js';
import { MultiplayerSystem } from './multiplayer.js';
import { addRemotePlayer, loadPlayer, spawnFallbackPlayer } from './player-factory.js';
import { createGame } from './game-setup.js';
import { startGameLoop } from './game-loop.js';
import { ChatPanel } from './chat.js';
import { PlayerStatus } from './player-status.js';
import { createWater } from './water.js';
import { InterfaceScale } from './interface-scale.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');
const loadingScreen = document.querySelector('#loading-screen');
const loadingTitle = document.querySelector('#loading-title');
const loadingMessage = document.querySelector('#loading-message');

function updateLoading(message, title = 'Carregando cena') {
  loadingTitle.textContent = title;
  loadingMessage.textContent = message;
}

function finishLoading() {
  loadingScreen.classList.add('loading-screen-hidden');
  loadingScreen.setAttribute('aria-hidden', 'true');
}

new InterfaceScale({
  root: document.documentElement,
  decreaseButton: document.querySelector('#ui-scale-decrease'),
  increaseButton: document.querySelector('#ui-scale-increase'),
});
const playerStatus = new PlayerStatus({
  root: document.querySelector('#player-status'),
  hpValue: document.querySelector('#player-hp-value'),
  hpBar: document.querySelector('#player-hp-bar'),
  manaBar: document.querySelector('#player-mana-bar'),
  xpBar: document.querySelector('#player-xp-bar'),
});
playerStatus.update({ hp: 100, maxHp: 100, mana: 100, maxMana: 100, xp: 0, maxXp: 100 });
// O chat e a cena sao inicializados uma unica vez; os sistemas fazem o trabalho por frame.
const chat = new ChatPanel({
  messagesElement: document.querySelector('#chat-messages'),
  formElement: document.querySelector('#chat-form'),
  inputElement: document.querySelector('#chat-input'),
  toggleButton: document.querySelector('#chat-toggle'),
});

async function loadLocalPlayer(game) {
  // O fallback permite testar a movimentacao mesmo quando o modelo demora ou falha.
  try {
    const entity = await Promise.race([
      loadPlayer(game.world, game.textureManager),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('Tempo limite ao carregar o modelo 3D.')), 10000);
      }),
    ]);
    return { entity, usedFallback: false };
  } catch (error) {
    console.error(error);
    return { entity: spawnFallbackPlayer(game.world), usedFallback: true };
  }
}

function followPlayer(game, playerEntity) {
  const transform = game.world.getComponent(playerEntity, Transform);
  game.camera.orbitalFollow(transform, {
    distance: 6,
    azimuth: 0,
    elevation: 0.35,
    targetHeight: 0.5,
  });
}

function createMultiplayer(game, playerEntity) {
  // Em producao, a URL vem do Render; localmente usamos o relay na porta 5174.
  const localUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:5174`;
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();
  const multiplayerUrl = (configuredUrl || (import.meta.env.PROD ? '' : localUrl))
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')
    .replace(/\/$/, '');
  const guestId = getGuestId();
  const url = multiplayerUrl ? new URL(multiplayerUrl) : null;
  url?.searchParams.set('guestId', guestId);
  const multiplayer = new MultiplayerSystem({
    url: url?.toString() ?? '',
    world: game.world,
    onStatus: (message) => {
      status.textContent = `${message} Clique para mover; Space cancela.`;
    },
    onPlayerState: (player) => playerStatus.update(player),
    onChat: (message) => chat.addMessage(message),
    createRemoteEntity: (peerId) => addRemotePlayer(game.world, playerEntity, peerId),
  });
  chat.connect((message) => multiplayer.sendChat(message));
  multiplayer.setLocalEntity(playerEntity);
  multiplayer.connect();
  return multiplayer;
}

function getGuestId() {
  const storageKey = 'webgl-rpg-guest-id';
  const savedGuestId = window.localStorage.getItem(storageKey);
  if (savedGuestId) return savedGuestId;

  const guestId = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, guestId);
  return guestId;
}

async function start() {
  updateLoading('Preparando o mundo...');
  status.textContent = 'Carregando cena...';
  const game = createGame(canvas, status);
  updateLoading('Carregando cenário e personagem...');
  createWater(game.world);
  const { entity: playerEntity, usedFallback } = await loadLocalPlayer(game);

  updateLoading('Finalizando cena...');
  followPlayer(game, playerEntity);
  const lineEntity = game.world.createEntity();
  // Entidade visual separada: o jogador continua sendo controlado apenas pelo ECS.
  game.world.addComponent(lineEntity, new LineRenderer({
    sourceEntity: playerEntity,
    radius: 0.35,
    thickness: 0.06,
  }));

  // adicionando o mapa 3d
  

  const multiplayerSystem = createMultiplayer(game, playerEntity);

  status.textContent = usedFallback
    ? 'Modelo 3D indisponível; usando modelo de fallback.'
    : 'WebGL ativo: clique para mover. Space cancela o destino.';
  finishLoading();
  startGameLoop({ ...game, multiplayerSystem });
}

start().catch((error) => {
  updateLoading(error.message, 'Não foi possível carregar');
  loadingScreen.classList.add('loading-screen-error');
  status.textContent = `Erro ao iniciar: ${error.message}`;
  console.error(error);
});
