import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

import { ServerLogger } from './logger.js';
import { PlayerStore } from './player-store.js';
import { CommandManager } from './command-manager.js';

import {
  port,
  host,
  allowedOrigins,
} from './multiplayer/config.js';

import {
  MIN_LEVEL_FOR_HIGHER_AREA,
  createEnemyAreas,
  isValidMapConfig,
  isWaterPosition,
} from './world/enemy-areas.js';

import { GameState } from './multiplayer/game-state.js';
import { createRequestHandler } from './multiplayer/routes.js';

const gameState = new GameState();
const logger = new ServerLogger();
const playerStore = new PlayerStore();

let enemyAreas = createEnemyAreas();

const requestHandler = createRequestHandler({
  state: gameState,
  playerStore,
  logger,
  allowedOrigins,

  onMapConfigChanged(mapConfig) {
    gameState.publishedMapConfig = mapConfig;
    enemyAreas = createEnemyAreas(mapConfig);
  },
});

const server = createServer(requestHandler);

const socketServer = new WebSocketServer({
  server,
});

function findPlayerArea(position) {
  return enemyAreas.find((area) => area.contains(position)) ?? null;
}

function promotePlayerToAreaTwo(player) {
  if (
    player.level < MIN_LEVEL_FOR_HIGHER_AREA ||
    player.area?.id !== 'starting-rat-area'
  ) {
    return false;
  }

  const area = enemyAreas.find(
    (item) => item.id === 'second-rat-area'
  );

  if (!area) {
    return false;
  }

  player.position = [...area.center];

  player.area = {
    id: area.id,
    name: 'Área dos Ratos 2',
    level: area.areaLevel,
  };

  return true;
}

function getConnectionIdentity(
  requestUrl,
  requestHeaders = {}
) {
  try {
    const params = new URL(
      requestUrl,
      'ws://localhost'
    ).searchParams;

    const cookies =
      requestHeaders.cookie?.split(';') ?? [];

    const cookie = cookies.find(
      (item) =>
        item.trim().startsWith('webgl_session=')
    );

    const token =
      cookie
        ?.split('=')
        .slice(1)
        .join('=')
        .trim() ??
      params.get('token');

    const session = token
      ? gameState.sessions.get(token)
      : null;

    if (session) {
      return {
        id: session.userId,
        nickname: session.nickname,
        isAdmin: session.isAdmin,
      };
    }

    const guestId = params.get('guestId');
    const nickname = params.get('nickname');

    if (
      /^[0-9a-f-]{36}$/i.test(
        guestId ?? ''
      )
    ) {
      return {
        id: guestId,
        nickname:
          /^[a-zA-Z0-9_ -]{2,20}$/.test(
            nickname ?? ''
          )
            ? nickname
            : 'Guest',
      };
    }
  } catch {
    return null;
  }

  return {
    id: randomUUID(),
    nickname: 'Guest',
  };
}

function isVector(value) {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) =>
      Number.isFinite(item)
    )
  );
}

function isChatMessage(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 200
  );
}

function getUserLabel(peerId, nickname) {
  return (
    nickname ||
    `Usuário ${peerId.slice(0, 6)}`
  );
}

function resolvePlayerTarget(
  selector,
  requesterPeerId,
  requesterPlayerId
) {
  if (
    typeof selector !== 'string' ||
    !selector.trim()
  ) {
    return null;
  }

  if (selector.toLowerCase() === '@p') {
    return {
      player: gameState.players.get(
        requesterPeerId
      ),
      playerId: requesterPlayerId,
    };
  }

  const nickname = selector.startsWith('@')
    ? selector.slice(1).trim()
    : '';

  if (!nickname) {
    return null;
  }

  for (
    const [peerId, player] of gameState.players
  ) {
    if (
      player.nickname.toLowerCase() !==
      nickname.toLowerCase()
    ) {
      continue;
    }

    const session = [
      ...gameState.activeGuestSessions.entries(),
    ].find(
      ([, active]) =>
        active.peerId === peerId
    );

    return session
      ? {
          player,
          playerId: session[0],
        }
      : null;
  }

  return null;
}

function getPlayerIdByPeerId(peerId) {
  for (
    const [playerId, session] of
      gameState.activeGuestSessions
  ) {
    if (session.peerId === peerId) {
      return playerId;
    }
  }

  return null;
}

function sendSystemMessage(socket, text) {
  if (socket?.readyState !== 1) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'system',
      text,
      sentAt: Date.now(),
    })
  );
}

function broadcastSnapshot() {
  const snapshot = JSON.stringify({
    type: 'snapshot',

    players: [
      ...gameState.players.values(),
    ].map((player) =>
      player.toSnapshot()
    ),

    enemies: enemyAreas.flatMap(
      (area) => area.toSnapshots()
    ),
  });

  for (
    const client of socketServer.clients
  ) {
    if (client.readyState === 1) {
      client.send(snapshot);
    }
  }
}

function broadcast(message) {
  const serialized =
    JSON.stringify(message);

  for (
    const client of socketServer.clients
  ) {
    if (client.readyState === 1) {
      client.send(serialized);
    }
  }
}

const commandManager =
  new CommandManager();

commandManager
  .register('help', {
    description:
      'Lista os comandos disponíveis',

    execute: ({
      socket,
      isAdmin,
    }) =>
      sendSystemMessage(
        socket,
        commandManager.help(isAdmin)
      ),
  })

  .register('map', {
    scope: 'admin',

    description:
      'Abre o editor de mapas',

    execute: ({
      socket,
      playerId,
    }) => {
      const ticket = randomUUID();

      gameState.mapAccessTickets.set(
        ticket,
        {
          userId: playerId,
          expiresAt:
            Date.now() + 60_000,
        }
      );

      socket.send(
        JSON.stringify({
          type: 'map-access',
          path:
            `/map-editor.html?access=${ticket}`,
        })
      );
    },
  })

  .register('xp', {
    scope: 'admin',

    description:
      'Adiciona XP a um jogador: /xp quantidade @jogador',

    execute: async ({
      socket,
      peerId,
      playerId,
      command,
    }) => {
      const amount = Number(
        command.args[0]
      );

      const targetName =
        command.args[1] ?? '@p';

      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > 1_000_000
      ) {
        sendSystemMessage(
          socket,
          'Quantidade de XP inválida.'
        );
        return;
      }

      const target =
        resolvePlayerTarget(
          targetName,
          peerId,
          playerId
        );

      if (!target?.player) {
        sendSystemMessage(
          socket,
          `Jogador nao encontrado: ${targetName}`
        );
        return;
      }

      const leveledUp =
        target.player.addExperience(
          amount
        );

      const promoted =
        leveledUp &&
        promotePlayerToAreaTwo(
          target.player
        );

      let message =
        `+${amount} XP para ${target.player.nickname}` +
        `${
          leveledUp
            ? '. Level aumentado.'
            : '.'
        }`;

      if (promoted) {
        message +=
          ' Teletransportado para a Área dos Ratos 2.';
      }

      if (leveledUp) {
        const targetSession =
          gameState.activeGuestSessions.get(
            target.playerId
          );

        sendSystemMessage(
          targetSession?.socket,
          `Você subiu para o level ${target.player.level}! Vida e mana restauradas para 100%.`
        );
      }

      await playerStore.save(
        target.playerId,
        target.player
      );

      sendSystemMessage(
        socket,
        message
      );

      broadcastSnapshot();
    },
  })

  .register('tp', {
    scope: 'global',

    description:
      'Teletransporta um jogador: /tp [@jogador] x y z',

    execute: async ({
      socket,
      peerId,
      playerId,
      command,
    }) => {
      let targetName = '@p';
      let coordinateIndex = 0;

      if (
        command.args[0]?.startsWith('@')
      ) {
        targetName =
          command.args[0];

        coordinateIndex = 1;
      }

      if (
        command.args.length -
          coordinateIndex !==
        3
      ) {
        sendSystemMessage(
          socket,
          'Uso: /tp [@jogador] x y z'
        );
        return;
      }

      const x = Number(
        command.args[coordinateIndex]
      );

      const y = Number(
        command.args[
          coordinateIndex + 1
        ]
      );

      const z = Number(
        command.args[
          coordinateIndex + 2
        ]
      );

      if (
        ![x, y, z].every(
          Number.isFinite
        )
      ) {
        sendSystemMessage(
          socket,
          'As coordenadas devem ser números válidos.'
        );
        return;
      }

      const target =
        resolvePlayerTarget(
          targetName,
          peerId,
          playerId
        );

      if (!target?.player) {
        sendSystemMessage(
          socket,
          `Jogador não encontrado: ${targetName}`
        );
        return;
      }

      target.player.setTransform(
        [x, y, z],
        target.player.rotation
      );

      await playerStore.save(
        target.playerId,
        target.player
      );

      sendSystemMessage(
        socket,
        `${target.player.nickname} foi teletransportado para ${x}, ${y}, ${z}.`
      );

      broadcastSnapshot();
    },
  })

  .register('hp', {
    scope: 'admin',

    description:
      'Adiciona vida a um jogador: /hp quantidade @jogador',

    execute: async ({
      socket,
      peerId,
      playerId,
      command,
    }) => {
      const amount = Number(
        command.args[0]
      );

      const targetName =
        command.args[1] ?? '@p';

      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > 1_000_000
      ) {
        sendSystemMessage(
          socket,
          'Quantidade de HP inválida.'
        );
        return;
      }

      const target =
        resolvePlayerTarget(
          targetName,
          peerId,
          playerId
        );

      if (!target?.player) {
        sendSystemMessage(
          socket,
          `Jogador nao encontrado: ${targetName}`
        );
        return;
      }

      target.player.hp =
        Math.min(
          target.player.maxHp,
          target.player.hp + amount
        );

      await playerStore.save(
        target.playerId,
        target.player
      );

      sendSystemMessage(
        socket,
        `+${amount} HP para ${target.player.nickname}.`
      );

      broadcastSnapshot();
    },
  });

socketServer.on(
  'connection',
  async (socket, request) => {
    const peerId = randomUUID();

    const identity =
      getConnectionIdentity(
        request.url,
        request.headers
      );

    if (!identity) {
      socket.close(
        4001,
        'Authentication required'
      );
      return;
    }

    const playerId =
      identity.id;

    const userLabel =
      getUserLabel(
        peerId,
        identity.nickname
      );

    if (
      gameState.activeGuestSessions.has(
        playerId
      )
    ) {
      logger.warn(
        'Conexao duplicada recusada',
        {
          peerId,
          playerId,
        }
      );

      socket.close(
        4008,
        'Guest already connected'
      );

      return;
    }

    gameState.activeGuestSessions.set(
      playerId,
      {
        peerId,
        socket,
      }
    );

    let player;

    try {
      player =
        await playerStore.get(
          playerId,
          peerId,
          identity.nickname
        );
    } catch (error) {
      logger.error(
        'Falha ao carregar jogador',
        {
          peerId,
          error: error.message,
        }
      );

      gameState.activeGuestSessions.delete(
        playerId
      );

      socket.close(
        1011,
        'Database unavailable'
      );

      return;
    }

    gameState.players.set(
      peerId,
      player
    );

    logger.info(
      `${userLabel} entrou no servidor`,
      {
        peerId,
      }
    );

    socket.send(
      JSON.stringify({
        type: 'welcome',
        peerId,
      })
    );

    broadcast({
      type: 'system',
      text:
        `${userLabel} entrou no servidor.`,
      sentAt: Date.now(),
    });

    broadcastSnapshot();

    if (player.dead) {
      socket.send(
        JSON.stringify({
          type: 'death',
        })
      );
    }

    socket.on(
      'message',
      async (rawMessage) => {
        try {
          const message =
            JSON.parse(
              rawMessage.toString()
            );

          const player =
            gameState.players.get(
              peerId
            );

          if (!player) {
            return;
          }

          if (
            message.type ===
            'ranking-request'
          ) {
            const ranking =
              await playerStore.getRanking();

            socket.send(
              JSON.stringify({
                type: 'ranking',
                players: ranking,
              })
            );

            return;
          }

          if (
            message.type === 'chat' &&
            isChatMessage(
              message.text
            )
          ) {
            const text =
              message.text.trim();

            if (
              await commandManager.execute(
                text,
                {
                  socket,
                  peerId,
                  playerId,
                  isAdmin:
                    identity.isAdmin ===
                    true,
                  sendSystem:
                    (messageText) =>
                      sendSystemMessage(
                        socket,
                        messageText
                      ),
                }
              )
            ) {
              return;
            }

            logger.info(
              'Mensagem de chat recebida',
              {
                peerId,
                length:
                  text.length,
              }
            );

            broadcast({
              type: 'chat',
              peerId,
              nickname:
                player.nickname,
              text,
              sentAt: Date.now(),
            });

            return;
          }

          if (
            message.type ===
            'attack'
          ) {
            if (player.dead) {
              return;
            }

            const attackAt =
              Date.now();

            let attackResult = {
              hit: false,
            };

            for (
              const area of enemyAreas
            ) {
              attackResult =
                area.attack(
                  player,
                  attackAt
                );

              if (
                attackResult.hit
              ) {
                break;
              }
            }

            if (
              attackResult.hit
            ) {
              const strengthLeveledUp =
                player.combatMode ===
                'melee'
                  ? player.registerMeleeAttack(
                      attackResult.damage,
                      attackAt
                    )
                  : false;

              if (
                attackResult.rewards
              ) {
                player.money +=
                  attackResult
                    .rewards.gold;

                const experience =
                  attackResult
                    .rewards
                    .experience;

                const leveledUp =
                  player.addExperience(
                    experience
                  );

                const promoted =
                  leveledUp &&
                  promotePlayerToAreaTwo(
                    player
                  );

                await playerStore.save(
                  playerId,
                  player
                );

                sendSystemMessage(
                  socket,
                  `Rato derrotado: +${attackResult.rewards.gold} ouro e +${attackResult.rewards.experience} XP.`
                );

                if (leveledUp) {
                  sendSystemMessage(
                    socket,
                    `Você subiu para o level ${player.level}! Vida e mana restauradas para 100%.`
                  );
                }

                if (promoted) {
                  sendSystemMessage(
                    socket,
                    'Você alcançou o nível 3 e foi teletransportado para a Área dos Ratos 2.'
                  );
                }
              } else {
                await playerStore.save(
                  playerId,
                  player
                );
              }

              if (
                strengthLeveledUp
              ) {
                sendSystemMessage(
                  socket,
                  `Sua força subiu para ${player.strength}! Progresso corpo-a-corpo reiniciado.`
                );
              }

              broadcastSnapshot();
            }

            return;
          }

          if (
            message.type ===
            'combat-mode'
          ) {
            if (
              player.setCombatMode(
                message.mode
              )
            ) {
              await playerStore.save(
                playerId,
                player
              );

              broadcastSnapshot();
            }

            return;
          }

          if (
            message.type ===
            'respawn'
          ) {
            if (!player.dead) {
              return;
            }

            player.respawn();

            await playerStore.save(
              playerId,
              player
            );

            socket.send(
              JSON.stringify({
                type: 'respawned',
                position: [
                  ...player.position,
                ],
                rotation: [
                  ...player.rotation,
                ],
              })
            );

            broadcastSnapshot();

            return;
          }

          if (player.dead) {
            return;
          }

          if (
            message.type !== 'state' ||
            !isVector(
              message.position
            ) ||
            !isVector(
              message.rotation
            )
          ) {
            logger.warn(
              'Mensagem inválida ignorada',
              {
                peerId,
                type: message.type,
              }
            );

            return;
          }

          if (
            isWaterPosition(
              message.position
            )
          ) {
            socket.send(
              JSON.stringify({
                type: 'water-blocked',
                position: [
                  ...player.position,
                ],
                rotation: [
                  ...player.rotation,
                ],
              })
            );

            sendSystemMessage(
              socket,
              'Não é possível caminhar sobre a água.'
            );

            return;
          }

          const destinationArea =
            findPlayerArea(
              message.position
            );

          player.area =
            destinationArea
              ? {
                  id:
                    destinationArea.id,
                  name:
                    destinationArea.id ===
                    'second-rat-area'
                      ? 'Área dos Ratos 2'
                      : 'Área dos Ratos',
                  level:
                    destinationArea.areaLevel,
                }
              : {
                  id: 'open-world',
                  name: 'Mundo aberto',
                  level: 0,
                };

          player.setTransform(
            message.position,
            message.rotation
          );

          await playerStore.save(
            playerId,
            player
          );

          broadcastSnapshot();
        } catch (error) {
          logger.warn(
            'Falha ao processar mensagem do jogador',
            {
              peerId,
              error: error.message,
            }
          );
        }
      }
    );

    socket.on(
      'close',
      async () => {
        const activeSession =
          gameState.activeGuestSessions.get(
            playerId
          );

        if (
          activeSession?.peerId ===
          peerId
        ) {
          gameState.activeGuestSessions.delete(
            playerId
          );
        }

        const player =
          gameState.players.get(
            peerId
          );

        if (player) {
          playerStore
            .save(
              playerId,
              player
            )
            .catch((error) => {
              logger.error(
                'Falha ao salvar jogador',
                {
                  peerId,
                  error: error.message,
                }
              );
            });
        }

        gameState.players.delete(
          peerId
        );

        logger.info(
          `${userLabel} saiu do servidor`,
          {
            peerId,
          }
        );

        broadcast({
          type: 'system',
          text:
            `${userLabel} saiu do servidor.`,
          sentAt: Date.now(),
        });

        broadcastSnapshot();
      }
    );
  }
);

playerStore.ready
  .then(async () => {
    gameState.databaseReady = true;

    const savedMapConfig =
      await playerStore.getMapConfig();

    if (
      savedMapConfig &&
      isValidMapConfig(
        savedMapConfig
      )
    ) {
      gameState.publishedMapConfig =
        savedMapConfig;

      enemyAreas =
        createEnemyAreas(
          savedMapConfig
        );
    }

    const initialSpawnAt =
      Date.now();

    for (
      const area of enemyAreas
    ) {
      area.update(
        initialSpawnAt,
        [],
        0
      );
    }

    let previousUpdateAt =
      initialSpawnAt;

    setInterval(
      async () => {
        const now =
          Date.now();

        const deltaSeconds =
          Math.min(
            (now -
              previousUpdateAt) /
              1000,
            0.25
          );

        previousUpdateAt =
          now;

        let changed = false;

        for (
          const area of enemyAreas
        ) {
          const result =
            area.update(
              now,
              gameState.players.values(),
              deltaSeconds
            );

          changed =
            result.changed ||
            changed;

          for (
            const deadPlayer of
              result.deadPlayers
          ) {
            const deadPlayerId =
              getPlayerIdByPeerId(
                deadPlayer.peerId
              );

            const session =
              gameState.activeGuestSessions.get(
                deadPlayerId
              );

            if (deadPlayerId) {
              await playerStore.save(
                deadPlayerId,
                deadPlayer
              );
            }

            if (
              session?.socket
                .readyState === 1
            ) {
              session.socket.send(
                JSON.stringify({
                  type: 'death',
                  sentAt: Date.now(),
                })
              );
            }
          }
        }

        if (changed) {
          broadcastSnapshot();
        }
      },
      50
    );

    server.listen(
      port,
      host,
      () => {
        logger.info(
          `Multiplayer relay ouvindo em ws://${host}:${port}`
        );
      }
    );
  })
  .catch((error) => {
    logger.error(
      'Nao foi possivel inicializar o PostgreSQL',
      {
        error: error.message,
      }
    );

    process.exitCode = 1;
  });