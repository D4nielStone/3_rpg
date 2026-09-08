import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { ServerLogger } from './logger.js';
import { PlayerStore } from './player-store.js';

const port = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 5174);
const host = process.env.HOST ?? '0.0.0.0';
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      service: 'webgl-rpg-multiplayer',
      status: 'ok',
      websocket: 'ready',
      health: '/health',
    }));
    return;
  }

  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', players: players.size }));
    return;
  }

  response.writeHead(404);
  response.end('Not found');
});
const socketServer = new WebSocketServer({ server });
const players = new Map();
const logger = new ServerLogger();
const playerStore = new PlayerStore();

function getGuestId(requestUrl) {
  try {
    const guestId = new URL(requestUrl, 'ws://localhost').searchParams.get('guestId');
    return /^[0-9a-f-]{36}$/i.test(guestId ?? '') ? guestId : randomUUID();
  } catch {
    return randomUUID();
  }
}

function isVector(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => Number.isFinite(item));
}

function isChatMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function getUserLabel(peerId) {
  return `Usuário ${peerId.slice(0, 6)}`;
}

function broadcastSnapshot() {
  // O relay mantem somente o estado temporario dos jogadores conectados.
  const snapshot = JSON.stringify({
    type: 'snapshot',
    players: [...players.values()].map((player) => player.toSnapshot()),
  });
  for (const client of socketServer.clients) {
    if (client.readyState === 1) client.send(snapshot);
  }
}

function broadcast(message) {
  const serialized = JSON.stringify(message);
  for (const client of socketServer.clients) {
    if (client.readyState === 1) client.send(serialized);
  }
}

socketServer.on('connection', async (socket, request) => {
  const peerId = randomUUID();
  const guestId = getGuestId(request.url);
  const userLabel = getUserLabel(peerId);
  let player;
  try {
    player = await playerStore.get(guestId, peerId);
  } catch (error) {
    logger.error('Falha ao carregar jogador', { peerId, error: error.message });
    socket.close(1011, 'Database unavailable');
    return;
  }
  players.set(peerId, player);
  // Identidade curta aparece no chat; o UUID completo fica apenas nos logs.
  logger.info(`${userLabel} entrou no servidor`, { peerId });
  socket.send(JSON.stringify({ type: 'welcome', peerId }));
  broadcast({
    type: 'system',
    text: `${userLabel} entrou no servidor.`,
    sentAt: Date.now(),
  });
  broadcastSnapshot();

  socket.on('message', async (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      const player = players.get(peerId);
      if (!player) return;

      if (message.type === 'chat' && isChatMessage(message.text)) {
        logger.info('Mensagem de chat recebida', {
          peerId,
          length: message.text.trim().length,
        });
        broadcast({
          type: 'chat',
          peerId,
          text: message.text.trim(),
          sentAt: Date.now(),
        });
        return;
      }

      if (message.type !== 'state' || !isVector(message.position) || !isVector(message.rotation)) {
        logger.warn('Mensagem inválida ignorada', { peerId, type: message.type });
        return;
      }
      player.setTransform(message.position, message.rotation);
      await playerStore.save(guestId, player);
      broadcastSnapshot();
    } catch (error) {
      logger.warn('Falha ao processar mensagem do jogador', { peerId, error: error.message });
    }
  });

  socket.on('close', async () => {
    const player = players.get(peerId);
    if (player) playerStore.save(guestId, player).catch((error) => {
      logger.error('Falha ao salvar jogador', { peerId, error: error.message });
    });
    players.delete(peerId);
    logger.info(`${userLabel} saiu do servidor`, { peerId });
    broadcast({
      type: 'system',
      text: `${userLabel} saiu do servidor.`,
      sentAt: Date.now(),
    });
    broadcastSnapshot();
  });
});

server.listen(port, host, () => {
  logger.info(`Multiplayer relay ouvindo em ws://${host}:${port}`);
});