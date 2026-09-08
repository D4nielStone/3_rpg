import { LineRenderer, Transform } from './components.js';
import { MultiplayerSystem } from './multiplayer.js';
import { addRemotePlayer, loadPlayer, spawnFallbackPlayer } from './player-factory.js';
import { createGame } from './game-setup.js';
import { startGameLoop } from './game-loop.js';
import { ChatPanel } from './chat.js';
import { PlayerStatus } from './player-status.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');
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
  const multiplayer = new MultiplayerSystem({
    url: multiplayerUrl,
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

async function start() {
  status.textContent = 'Carregando modelo 3D...';
  const game = createGame(canvas, status);
  const { entity: playerEntity, usedFallback } = await loadLocalPlayer(game);

  followPlayer(game, playerEntity);
  const lineEntity = game.world.createEntity();
  // Entidade visual separada: o jogador continua sendo controlado apenas pelo ECS.
  game.world.addComponent(lineEntity, new LineRenderer({
    sourceEntity: playerEntity,
    radius: 0.35,
    thickness: 0.06,
  }));

  const multiplayerSystem = createMultiplayer(game, playerEntity);

  status.textContent = usedFallback
    ? 'Modelo 3D indisponível; usando modelo de fallback.'
    : 'WebGL ativo: clique para mover. Space cancela o destino.';
  startGameLoop({ ...game, multiplayerSystem });
}

start().catch((error) => {
  status.textContent = `Erro ao iniciar: ${error.message}`;
  console.error(error);
});
