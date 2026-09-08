import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { ServerLogger } from './logger.js';
import { PlayerStore } from './player-store.js';
import { EnemyArea } from './enemy-area.js';
import {
  createAccountId,
  createSession,
  hashPassword,
  validateCredentials,
  verifyPassword,
} from './auth.js';

const port = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 5174);
const host = process.env.HOST ?? '0.0.0.0';
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'https://webgl-rpg-frontend.onrender.com';
let databaseReady = false;

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin === frontendOrigin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('vary', 'Origin');
  }
}

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
  setCorsHeaders(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestPath = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`).pathname;

  if (request.method === 'POST' && ['/api/register', '/api/login'].includes(requestPath)) {
    try {
      const body = await readJson(request);
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
      const password = body.password;
      if (!validateCredentials(nickname, password)) {
        sendJson(response, 400, { error: 'Nickname ou senha invalidos.' });
        return;
      }
      if (requestPath === '/api/register') {
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

  if (requestPath === '/') {
    response.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
    response.end(JSON.stringify({
      service: 'webgl-rpg-multiplayer',
      status: 'ok',
      websocket: 'ready',
      health: '/health',
    }));
    return;
  }

  if (requestPath === '/health') {
    const body = JSON.stringify({ status: databaseReady ? 'ok' : 'starting', players: players.size });
    response.writeHead(databaseReady ? 200 : 503, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      connection: 'close',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
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
const enemyAreas = [new EnemyArea({
  id: 'starting-rat-area',
  center: [0, 0, 0],
  width: 25,
  depth: 25,
  maxEnemies: 5,
  enemyType: 'rat',
})];

function getConnectionIdentity(requestUrl) {
  try {
    const params = new URL(requestUrl, 'ws://localhost').searchParams;
    const token = params.get('token');
    const session = token ? sessions.get(token) : null;
    if (session) {
      return {
        id: session.userId,
        nickname: session.nickname,
        isAdmin: session.isAdmin,
      };
    }
    const guestId = params.get('guestId');
    const nickname = params.get('nickname');
    if (/^[0-9a-f-]{36}$/i.test(guestId ?? '')) {
      return {
        id: guestId,
        nickname: /^[a-zA-Z0-9_ -]{2,20}$/.test(nickname ?? '') ? nickname : 'Guest',
      };
    }
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

function parseAdminCommand(text) {
  const match = text.trim().match(/^\/(xp|hp)\s+(\d+)(?:\s+(@.+))?$/i);
  if (!match) return null;
  const amount = Number(match[2]);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000) return null;
  return {
    type: match[1].toLowerCase(),
    amount,
    target: match[3]?.trim() ?? '@p',
  };
}

function getUserLabel(peerId, nickname) {
  return nickname || `Usuário ${peerId.slice(0, 6)}`;
}

function resolvePlayerTarget(selector, requesterPeerId, requesterPlayerId) {
  if (selector.toLowerCase() === '@p') {
    return {
      player: players.get(requesterPeerId),
      playerId: requesterPlayerId,
    };
  }

  const nickname = selector.startsWith('@') ? selector.slice(1).trim() : '';
  if (!nickname) return null;

  for (const [peerId, player] of players) {
    if (player.nickname.toLowerCase() !== nickname.toLowerCase()) continue;
    const session = [...activeGuestSessions.entries()]
      .find(([, active]) => active.peerId === peerId);
    return session ? { player, playerId: session[0] } : null;
  }
  return null;
}

function broadcastSnapshot() {
  // O relay mantem somente o estado temporario dos jogadores conectados.
  const snapshot = JSON.stringify({
    type: 'snapshot',
    players: [...players.values()].map((player) => player.toSnapshot()),
    enemies: enemyAreas.flatMap((area) => area.toSnapshots()),
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
  const userLabel = getUserLabel(peerId, identity.nickname);
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
        const text = message.text.trim();
        const command = parseAdminCommand(text);
        if (command) {
          if (!identity.isAdmin) {
            socket.send(JSON.stringify({
              type: 'system',
              text: 'Comando restrito ao administrador.',
              sentAt: Date.now(),
            }));
            return;
          }

          const target = resolvePlayerTarget(command.target, peerId, playerId);
          if (!target?.player) {
            socket.send(JSON.stringify({
              type: 'system',
              text: `Jogador nao encontrado: ${command.target}`,
              sentAt: Date.now(),
            }));
            return;
          }

          let messageText;
          if (command.type === 'xp') {
            const leveledUp = target.player.addExperience(command.amount);
            messageText = `+${command.amount} XP para ${target.player.nickname}${leveledUp ? '. Level aumentado.' : '.'}`;
          } else {
            target.player.hp = Math.min(
              target.player.maxHp,
              target.player.hp + command.amount,
            );
            messageText = `+${command.amount} HP para ${target.player.nickname}.`;
          }

          await playerStore.save(target.playerId, target.player);
          socket.send(JSON.stringify({
            type: 'system',
            text: messageText,
            sentAt: Date.now(),
          }));
          broadcastSnapshot();
          return;
        }
        logger.info('Mensagem de chat recebida', {
          peerId,
          length: text.length,
        });
        broadcast({
          type: 'chat',
          peerId,
          nickname: player.nickname,
          text,
          sentAt: Date.now(),
        });
        return;
      }

      if (message.type === 'attack') {
        let attackResult = { hit: false };
        for (const area of enemyAreas) {
          attackResult = area.attack(player, Date.now());
          if (attackResult.hit) break;
        }
        if (attackResult.hit) {
          if (attackResult.rewards) {
            player.money += attackResult.rewards.gold;
            const leveledUp = player.addExperience(attackResult.rewards.experience);
            await playerStore.save(playerId, player);
            socket.send(JSON.stringify({
              type: 'system',
              text: `Rato derrotado: +${attackResult.rewards.gold} ouro e +${attackResult.rewards.experience} XP${leveledUp ? '. Level aumentado.' : '.'}`,
              sentAt: Date.now(),
            }));
          }
          broadcastSnapshot();
        }
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
    databaseReady = true;
    const initialSpawnAt = Date.now();
    for (const area of enemyAreas) area.update(initialSpawnAt, [], 0);
    let previousUpdateAt = initialSpawnAt;
    setInterval(() => {
      const now = Date.now();
      const deltaSeconds = Math.min((now - previousUpdateAt) / 1000, 0.25);
      previousUpdateAt = now;
      let changed = false;
      for (const area of enemyAreas) {
        const result = area.update(now, players.values(), deltaSeconds);
        changed = result.changed || changed;
      }
      if (changed) broadcastSnapshot();
    }, 50);
    server.listen(port, host, () => {
      logger.info(`Multiplayer relay ouvindo em ws://${host}:${port}`);
    });
  })
  .catch((error) => {
    logger.error('Nao foi possivel inicializar o PostgreSQL', { error: error.message });
    process.exitCode = 1;
  });