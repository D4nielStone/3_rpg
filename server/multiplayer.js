import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { ServerLogger } from './logger.js';
import { PlayerStore } from './player-store.js';
import {
  createAccountId,
  createSession,
  hashPassword,
  validateCredentials,
  verifyPassword,
} from './auth.js';

const port = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 5174);
const host = process.env.HOST ?? '0.0.0.0';
async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Payload too large');
  }
  return JSON.parse(body || '{}');
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === 'POST' && ['/api/register', '/api/login'].includes(request.url)) {
    try {
      const body = await readJson(request);
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
      const password = body.password;
      if (!validateCredentials(nickname, password)) {
        sendJson(response, 400, { error: 'Nickname ou senha invalidos.' });
        return;
      }
      if (request.url === '/api/register') {
        if (await playerStore.findUser(nickname)) {
          sendJson(response, 409, { error: 'Nickname indisponivel.' });
          return;
        }
        const user = { id: createAccountId(), nickname };
        await playerStore.registerUser(user.id, nickname, await hashPassword(password));
        const session = createSession(user);
        sessions.set(session.token, session);
        sendJson(response, 201, { token: session.token, nickname });
        return;
      }
      const user = await playerStore.findUser(nickname);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        sendJson(response, 401, { error: 'Credenciais invalidas.' });
        return;
      }
      const session = createSession(user);
      sessions.set(session.token, session);
      sendJson(response, 200, { token: session.token, nickname: user.nickname });
    } catch (error) {
      logger.warn('Falha na autenticacao', { error: error.message });
      sendJson(response, 400, { error: 'Nao foi possivel processar a solicitacao.' });
    }
    return;
  }

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
const activeGuestSessions = new Map();
const sessions = new Map();
const logger = new ServerLogger();
const playerStore = new PlayerStore();

function getConnectionIdentity(requestUrl) {
  try {
    const params = new URL(requestUrl, 'ws://localhost').searchParams;
    const token = params.get('token');
    const session = token ? sessions.get(token) : null;
    if (session) return { id: session.userId, nickname: session.nickname };
    const guestId = params.get('guestId');
    if (/^[0-9a-f-]{36}$/i.test(guestId ?? '')) return { id: guestId, nickname: 'Guest' };
  } catch {
    return null;
  }
  return { id: randomUUID(), nickname: 'Guest' };
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
  const identity = getConnectionIdentity(request.url);
  if (!identity) {
    socket.close(4001, 'Authentication required');
    return;
  }
  const playerId = identity.id;
  const userLabel = getUserLabel(peerId);
  if (activeGuestSessions.has(playerId)) {
    logger.warn('Conexao duplicada recusada', { peerId, playerId });
    socket.close(4008, 'Guest already connected');
    return;
  }
  activeGuestSessions.set(playerId, { peerId, socket });

  let player;
  try {
    player = await playerStore.get(playerId, peerId, identity.nickname);
  } catch (error) {
    logger.error('Falha ao carregar jogador', { peerId, error: error.message });
    activeGuestSessions.delete(playerId);
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
      await playerStore.save(playerId, player);
      broadcastSnapshot();
    } catch (error) {
      logger.warn('Falha ao processar mensagem do jogador', { peerId, error: error.message });
    }
  });

  socket.on('close', async () => {
    const activeSession = activeGuestSessions.get(playerId);
    if (activeSession?.peerId === peerId) activeGuestSessions.delete(playerId);
    const player = players.get(peerId);
    if (player) playerStore.save(playerId, player).catch((error) => {
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

playerStore.ready
  .then(() => {
    server.listen(port, host, () => {
      logger.info(`Multiplayer relay ouvindo em ws://${host}:${port}`);
    });
  })
  .catch((error) => {
    logger.error('Nao foi possivel inicializar o PostgreSQL', { error: error.message });
    process.exitCode = 1;
  });