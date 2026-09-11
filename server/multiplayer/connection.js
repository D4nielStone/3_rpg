import { randomUUID } from 'node:crypto';
import {
  getConnectionIdentity,
  isVector,
  isChatMessage,
  getUserLabel,
  sendSystemMessage,
} from './utils.js';
import { isWaterPosition } from '../world/enemy-areas.js';
import { promotePlayerToAreaTwo } from './player-actions.js';
import { maxWebSocketConnections } from './config.js';

export function registerConnectionHandler({
  socketServer,
  state,
  playerStore,
  logger,
  commandManager,
  broadcastSnapshot,
  broadcast,
  queuePlayerSave,
  savePlayer,
}) {
  socketServer.on('connection', async (socket, request) => {
    if (socketServer.clients.size >= maxWebSocketConnections) {
      socket.close(1013, 'Server busy');
      return;
    }
    const peerId = randomUUID();
    const identity = getConnectionIdentity(request.url, request.headers, state.sessions);
    if (!identity) {
      socket.close(4001, 'Authentication required');
      return;
    }
    const playerId = identity.id;
    const userLabel = getUserLabel(peerId, identity.nickname);

    if (identity.isAdmin !== undefined) {
      try {
        const account = await playerStore.findUser(identity.nickname);
        identity.isAdmin = account?.id === playerId && account.is_admin === true;
      } catch (error) {
        logger.warn('Nao foi possivel atualizar permissao administrativa', {
          peerId,
          error: error.message,
        });
      }
    }

    if (state.activeGuestSessions.has(playerId)) {
      logger.warn('Conexao duplicada recusada', { peerId, playerId });
      socket.close(4008, 'Guest already connected');
      return;
    }
    state.activeGuestSessions.set(playerId, {
      peerId,
      socket,
      isAdmin: identity.isAdmin === true,
    });

    let player;
    try {
      player = await playerStore.get(
        playerId,
        peerId,
        identity.nickname,
        state.publishedMapConfig?.player ?? {},
      );
    } catch (error) {
      logger.error('Falha ao carregar jogador', { peerId, error: error.message });
      state.activeGuestSessions.delete(playerId);
      socket.close(1011, 'Database unavailable');
      return;
    }
    state.players.set(peerId, player);
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
        const player = state.players.get(peerId);
        if (!player) return;

        if (message.type === 'ranking-request') {
          const ranking = await playerStore.getRanking();
          socket.send(JSON.stringify({ type: 'ranking', players: ranking }));
          return;
        }

        if (message.type === 'chat' && isChatMessage(message.text)) {
          const text = message.text.trim();
          let isAdmin = identity.isAdmin === true;
          if (identity.isAdmin !== undefined) {
            const account = await playerStore.findUser(identity.nickname);
            isAdmin = account?.id === playerId && account.is_admin === true;
            identity.isAdmin = isAdmin;
            const activeSession = state.activeGuestSessions.get(playerId);
            if (activeSession) activeSession.isAdmin = isAdmin;
          }
          if (await commandManager.execute(text, {
            socket,
            peerId,
            playerId,
            isAdmin,
            sendSystem: (messageText) => sendSystemMessage(socket, messageText),
          })) return;
          logger.info('Mensagem de chat recebida', {
            peerId,
            length: text.length,
          });
          broadcast({
            type: 'chat',
            peerId,
            nickname: player.nickname,
            text,
            isAdmin,
            sentAt: Date.now(),
          });
          return;
        }

        if (message.type === 'attack') {
          if (player.dead) return;
          const attackAt = Date.now();
          let attackResult = { hit: false };
          for (const area of state.enemyAreas) {
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
              const promoted = leveledUp && promotePlayerToAreaTwo(player, state);
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
        if (isWaterPosition(message.position, state.publishedMapConfig)) {
          socket.send(JSON.stringify({
            type: 'water-blocked',
            position: [...player.position],
            rotation: [...player.rotation],
          }));
          sendSystemMessage(socket, 'Não é possível caminhar sobre a água.');
          return;
        }
        const physicsPosition = state.physics.movePlayer(
          playerId,
          player.position,
          message.position,
        );
        if (Math.hypot(
          physicsPosition[0] - message.position[0],
          physicsPosition[2] - message.position[2],
        ) > 0.05) {
          socket.send(JSON.stringify({
            type: 'collision-blocked',
            position: [...player.position],
            rotation: [...player.rotation],
          }));
          sendSystemMessage(socket, 'Não é possível atravessar um objeto.');
          return;
        }
        const destinationArea = state.findPlayerArea(message.position);
        player.area = destinationArea
          ? {
            id: destinationArea.id,
            name: destinationArea.id === 'second-rat-area' ? 'Área dos Ratos 2' : 'Área dos Ratos',
            level: destinationArea.areaLevel,
          }
          : { id: 'open-world', name: 'Mundo aberto', level: 0 };
        player.setTransform(message.position, message.rotation);
        queuePlayerSave(playerId, player);
        broadcastSnapshot();
      } catch (error) {
        logger.warn('Falha ao processar mensagem do jogador', { peerId, error: error.message });
      }
    });

    socket.on('close', async () => {
      const activeSession = state.activeGuestSessions.get(playerId);
      if (activeSession?.peerId === peerId) state.activeGuestSessions.delete(playerId);
      const player = state.players.get(peerId);
      if (player) savePlayer(playerId, player).catch((error) => {
        logger.error('Falha ao salvar jogador', { peerId, error: error.message });
      });
      state.players.delete(peerId);
      logger.info(`${userLabel} saiu do servidor`, { peerId });
      broadcast({
        type: 'system',
        text: `${userLabel} saiu do servidor.`,
        sentAt: Date.now(),
      });
      broadcastSnapshot();
    });
  });
}