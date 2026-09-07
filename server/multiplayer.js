import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { ServerLogger } from './logger.js';

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
    players: [...players.values()],
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

socketServer.on('connection', (socket) => {
  const peerId = randomUUID();
  const userLabel = getUserLabel(peerId);
  players.set(peerId, {
    peerId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  // Identidade curta aparece no chat; o UUID completo fica apenas nos logs.
  logger.info(`${userLabel} entrou no servidor`, { peerId });
  socket.send(JSON.stringify({ type: 'welcome', peerId }));
  broadcast({
    type: 'system',
    text: `${userLabel} entrou no servidor.`,
    sentAt: Date.now(),
  });
  broadcastSnapshot();

  socket.on('message', (rawMessage) => {
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
      player.position = message.position.slice(0, 3).map(Number);
      player.rotation = message.rotation.slice(0, 3).map(Number);
      broadcastSnapshot();
    } catch {
      // Ignore malformed client messages.
    }
  });

  socket.on('close', () => {
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