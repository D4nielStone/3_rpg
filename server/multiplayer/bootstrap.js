import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

import { ServerLogger } from '../logger.js';
import { PlayerStore } from '../player-store.js';
import {
  allowedOrigins,
  host,
  httpRateWindowMs,
  httpRequestsPerWindow,
  port,
  webSocketMaxPayload,
} from './config.js';
import { createRateLimiter } from '../rate-limit.js';
import { GameState } from './game-state.js';
import { createRequestHandler } from './routes.js';
import { createBroadcaster } from './broadcast.js';
import { createCommandManager } from './commands.js';
import { registerConnectionHandler } from './connection.js';
import { createPlayerPersistence } from './persistence.js';
import { isValidMapConfig } from '../world/enemy-areas.js';

export function startMultiplayerServer() {
  const state = new GameState();
  const logger = new ServerLogger();
  const playerStore = new PlayerStore();
  const allowHttpRequest = createRateLimiter({
    limit: httpRequestsPerWindow,
    windowMs: httpRateWindowMs,
  });

  const requestHandler = createRequestHandler({
    state,
    playerStore,
    logger,
    allowedOrigins,
    allowRequest: (request) => allowHttpRequest(
      request.socket.remoteAddress ?? 'unknown',
    ),
    onMapConfigChanged: (mapConfig) => state.setMapConfig(mapConfig),
  });

  const server = createServer(requestHandler);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  const socketServer = new WebSocketServer({
    server,
    maxPayload: webSocketMaxPayload,
  });
  const { broadcastSnapshot, broadcast } = createBroadcaster(socketServer, state);
  const commandManager = createCommandManager({
    state,
    playerStore,
    broadcastSnapshot,
  });
  const { queuePlayerSave, savePlayer } = createPlayerPersistence({
    playerStore,
    logger,
  });

  registerConnectionHandler({
    socketServer,
    state,
    playerStore,
    logger,
    commandManager,
    broadcastSnapshot,
    broadcast,
    queuePlayerSave,
    savePlayer,
  });

  server.listen(port, host, () => {
    logger.info(`Multiplayer relay ouvindo em ws://${host}:${port}`);
  });

  playerStore.ready
    .then(async () => {
      state.databaseReady = true;
      const savedMapConfig = await playerStore.getMapConfig();

      if (savedMapConfig && isValidMapConfig(savedMapConfig)) {
        state.setMapConfig(savedMapConfig);
      }

      const initialSpawnAt = Date.now();
      for (const area of state.enemyAreas) {
        area.update(initialSpawnAt, [], 0);
      }

      let previousUpdateAt = initialSpawnAt;
      setInterval(async () => {
        const now = Date.now();
        const deltaSeconds = Math.min((now - previousUpdateAt) / 1000, 0.25);
        previousUpdateAt = now;
        let changed = false;

        for (const area of state.enemyAreas) {
          const result = area.update(
            now,
            state.players.values(),
            deltaSeconds,
          );
          changed = result.changed || changed;

          for (const deadPlayer of result.deadPlayers) {
            const deadPlayerId = state.getPlayerIdByPeerId(deadPlayer.peerId);
            const session = state.activeGuestSessions.get(deadPlayerId);

            if (deadPlayerId) {
              await savePlayer(deadPlayerId, deadPlayer);
            }

            if (session?.socket?.readyState === 1) {
              session.socket.send(JSON.stringify({
                type: 'death',
                sentAt: Date.now(),
              }));
            }
          }
        }

        if (changed) broadcastSnapshot();
      }, 50);
    })
    .catch((error) => {
      logger.error('Nao foi possivel inicializar o PostgreSQL', {
        error: error.message,
      });
      process.exitCode = 1;
    });

  return { server, socketServer, state };
}
