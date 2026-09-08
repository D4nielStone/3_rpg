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
const allowedOrigins = new Set([
  frontendOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
let databaseReady = false;

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'GET, PUT, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('vary', 'Origin');
  }
}

function createSessionCookie(request, token) {
  const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
  return [
    `webgl_session=${token}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=604800',
    `SameSite=${secure ? 'None' : 'Lax'}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function createClearedSessionCookie(request) {
  const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
  return [
    'webgl_session=',
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `SameSite=${secure ? 'None' : 'Lax'}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function getSessionFromRequest(request) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith('webgl_session='));
  const token = sessionCookie?.split('=').slice(1).join('=').trim();
  return token ? sessions.get(token) ?? null : null;
}

function isValidMapConfig(config) {
  return config && typeof config === 'object'
    && Array.isArray(config.enemyAreas)
    && config.enemyAreas.every((area) => area && typeof area === 'object'
      && Array.isArray(area.center)
      && area.center.length === 3
      && area.center.every((value) => Number.isFinite(value))
      && Number.isFinite(area.width) && area.width > 0
      && Number.isFinite(area.depth) && area.depth > 0)
    && config.water && typeof config.water.enabled === 'boolean';
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('Payload too large');
  }
  return JSON.parse(body || '{}');
}

function sendJson(response, statusCode, body, headers = {}) {
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
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

  if (request.method === 'GET' && requestPath === '/api/session') {
    const session = getSessionFromRequest(request);
    if (!session) {
      sendJson(response, 401, { authenticated: false });
      return;
    }
    sendJson(response, 200, {
      authenticated: true,
      nickname: session.nickname,
      isAdmin: session.isAdmin,
    });
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/map-config') {
    sendJson(response, 200, publishedMapConfig ?? {});
    return;
  }

  if (request.method === 'PUT' && requestPath === '/api/map-config') {
    const session = getSessionFromRequest(request);
    if (!session?.isAdmin) {
      sendJson(response, 403, { error: 'Acesso restrito ao administrador.' });
      return;
    }
    try {
      const body = await readJson(request);
      if (!isValidMapConfig(body)) {
        sendJson(response, 400, { error: 'Configuracao de mapa invalida.' });
        return;
      }
      publishedMapConfig = body;
      enemyAreas = createEnemyAreas(body);
      sendJson(response, 200, { saved: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/map-access') {
    const ticket = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`).searchParams.get('ticket');
    const access = mapAccessTickets.get(ticket);
    const session = getSessionFromRequest(request);
    const authorized = access
      && access.expiresAt > Date.now()
      && session?.isAdmin
      && session.userId === access.userId;
    if (!authorized) {
      sendJson(response, 403, { authorized: false });
      return;
    }
    mapAccessTickets.delete(ticket);
    sendJson(response, 200, { authorized: true });
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/logout') {
    const session = getSessionFromRequest(request);
    if (session) sessions.delete(session.token);
    sendJson(response, 200, { authenticated: false }, {
      'set-cookie': createClearedSessionCookie(request),
    });
    return;
  }

  if (request.method === 'POST' && ['/api/register', '/api/login'].includes(requestPath)) {
    try {
      const body = await readJson(request);
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
      const password = body.password;
      const guestId = typeof body.guestId === 'string' ? body.guestId : null;
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
        await playerStore.migrateGuest(guestId, user.id, nickname);
        const session = createSession(user);
        sessions.set(session.token, session);
        sendJson(response, 201, { nickname }, {
          'set-cookie': createSessionCookie(request, session.token),
        });
        return;
      }
      const user = await playerStore.findUser(nickname);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        sendJson(response, 401, { error: 'Credenciais invalidas.' });
        return;
      }
      const session = createSession(user);
      sessions.set(session.token, session);
      sendJson(response, 200, { nickname: user.nickname }, {
        'set-cookie': createSessionCookie(request, session.token),
      });
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
const mapAccessTickets = new Map();
let publishedMapConfig = null;
const logger = new ServerLogger();
const playerStore = new PlayerStore();
const DEFAULT_ENEMY_AREAS = [
  { id: 'starting-rat-area', center: [0, 0, 0], width: 25, depth: 25, areaLevel: 1 },
  { id: 'second-rat-area', center: [35, 0, 0], width: 25, depth: 25, areaLevel: 2 },
];

function createEnemyAreas(config = null) {
  const definitions = Array.isArray(config?.enemyAreas)
    ? config.enemyAreas
    : DEFAULT_ENEMY_AREAS;
  return definitions.map((area, index) => new EnemyArea({
    id: area.id ?? (index === 0 ? 'starting-rat-area' : `map-area-${index + 1}`),
    center: area.center,
    width: area.width,
    depth: area.depth,
    maxEnemies: area.maxEnemies ?? 5,
    enemyType: area.enemyType ?? 'rat',
    areaLevel: area.areaLevel ?? Math.min(index + 1, 2),
  }));
}

let enemyAreas = createEnemyAreas();
const MIN_LEVEL_FOR_HIGHER_AREA = 3;

function findPlayerArea(position) {
  return enemyAreas.find((area) => area.contains(position)) ?? null;
}

function promotePlayerToAreaTwo(player) {
  if (player.level < MIN_LEVEL_FOR_HIGHER_AREA || player.area?.id !== 'starting-rat-area') {
    return false;
  }

  const area = enemyAreas.find((item) => item.id === 'second-rat-area');
  player.position = [...area.center];
  player.area = {
    id: area.id,
    name: 'Área dos Ratos 2',
    level: area.areaLevel,
  };
  return true;
}

function getConnectionIdentity(requestUrl, requestHeaders = {}) {
  try {
    const params = new URL(requestUrl, 'ws://localhost').searchParams;
    const cookies = requestHeaders.cookie?.split(';') ?? [];
    const cookie = cookies.find((item) => item.trim().startsWith('webgl_session='));
    const token = cookie?.split('=').slice(1).join('=').trim() ?? params.get('token');
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
  if (text.trim().toLowerCase() === '/map') return { type: 'map' };
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

function getPlayerIdByPeerId(peerId) {
  for (const [playerId, session] of activeGuestSessions) {
    if (session.peerId === peerId) return playerId;
  }
  return null;
}

function sendSystemMessage(socket, text) {
  if (socket?.readyState !== 1) return;
  socket.send(JSON.stringify({
    type: 'system',
    text,
    sentAt: Date.now(),
  }));
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
  const identity = getConnectionIdentity(request.url, request.headers);
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
  if (player.dead) socket.send(JSON.stringify({ type: 'death' }));

  socket.on('message', async (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      const player = players.get(peerId);
      if (!player) return;

      if (message.type === 'ranking-request') {
        const ranking = await playerStore.getRanking();
        socket.send(JSON.stringify({ type: 'ranking', players: ranking }));
        return;
      }

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

          if (command.type === 'map') {
            const ticket = randomUUID();
            mapAccessTickets.set(ticket, {
              userId: playerId,
              expiresAt: Date.now() + 60_000,
            });
            socket.send(JSON.stringify({
              type: 'map-access',
              path: `/map-editor.html?access=${ticket}`,
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
            const promoted = leveledUp && promotePlayerToAreaTwo(target.player);
            messageText = `+${command.amount} XP para ${target.player.nickname}${leveledUp ? '. Level aumentado.' : '.'}`;
            if (promoted) messageText += ' Teletransportado para a Área dos Ratos 2.';
            if (leveledUp) {
              const targetSession = activeGuestSessions.get(target.playerId);
              sendSystemMessage(
                targetSession?.socket,
                `Você subiu para o level ${target.player.level}! Vida e mana restauradas para 100%.`,
              );
            }
          } else {
            target.player.hp = Math.min(
              target.player.maxHp,
              target.player.hp + command.amount,
            );
            messageText = `+${command.amount} HP para ${target.player.nickname}.`;
          }

          await playerStore.save(target.playerId, target.player);
          sendSystemMessage(socket, messageText);
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
        if (player.dead) return;
        const attackAt = Date.now();
        let attackResult = { hit: false };
        for (const area of enemyAreas) {
          attackResult = area.attack(player, attackAt);
          if (attackResult.hit) break;
        }
        if (attackResult.hit) {
          const strengthLeveledUp = player.combatMode === 'melee'
            ? player.registerMeleeAttack(attackResult.damage, attackAt)
            : false;
          if (attackResult.rewards) {
            player.money += attackResult.rewards.gold;
            const experience = attackResult.rewards.experience;
            const leveledUp = player.addExperience(experience);
            const promoted = leveledUp && promotePlayerToAreaTwo(player);
            await playerStore.save(playerId, player);
            sendSystemMessage(
              socket,
              `Rato derrotado: +${attackResult.rewards.gold} ouro e +${attackResult.rewards.experience} XP${leveledUp ? '.' : '.'}`,
            );
            if (leveledUp) {
              sendSystemMessage(
                socket,
                `Você subiu para o level ${player.level}! Vida e mana restauradas para 100%.`,
              );
            }
            if (promoted) {
              sendSystemMessage(socket, 'Você alcançou o nível 3 e foi teletransportado para a Área dos Ratos 2.');
            }
          } else {
            await playerStore.save(playerId, player);
          }
          if (strengthLeveledUp) {
            sendSystemMessage(
              socket,
              `Sua força subiu para ${player.strength}! Progresso corpo-a-corpo reiniciado.`,
            );
          }
          broadcastSnapshot();
        }
        return;
      }

      if (message.type === 'combat-mode') {
        if (player.setCombatMode(message.mode)) {
          await playerStore.save(playerId, player);
          broadcastSnapshot();
        }
        return;
      }

      if (message.type === 'respawn') {
        if (!player.dead) return;
        player.respawn();
        await playerStore.save(playerId, player);
        socket.send(JSON.stringify({
          type: 'respawned',
          position: [...player.position],
          rotation: [...player.rotation],
        }));
        broadcastSnapshot();
        return;
      }

      if (player.dead) return;
      if (message.type !== 'state' || !isVector(message.position) || !isVector(message.rotation)) {
        logger.warn('Mensagem inválida ignorada', { peerId, type: message.type });
        return;
      }
      const destinationArea = findPlayerArea(message.position);
      player.area = destinationArea
        ? {
          id: destinationArea.id,
          name: destinationArea.id === 'second-rat-area' ? 'Área dos Ratos 2' : 'Área dos Ratos',
          level: destinationArea.areaLevel,
        }
        : { id: 'open-world', name: 'Mundo aberto', level: 0 };
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
    setInterval(async () => {
      const now = Date.now();
      const deltaSeconds = Math.min((now - previousUpdateAt) / 1000, 0.25);
      previousUpdateAt = now;
      let changed = false;
      for (const area of enemyAreas) {
        const result = area.update(now, players.values(), deltaSeconds);
        changed = result.changed || changed;
        for (const deadPlayer of result.deadPlayers) {
          const deadPlayerId = getPlayerIdByPeerId(deadPlayer.peerId);
          const session = activeGuestSessions.get(deadPlayerId);
          if (deadPlayerId) await playerStore.save(deadPlayerId, deadPlayer);
          if (session?.socket.readyState === 1) {
            session.socket.send(JSON.stringify({
              type: 'death',
              sentAt: Date.now(),
            }));
          }
        }
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