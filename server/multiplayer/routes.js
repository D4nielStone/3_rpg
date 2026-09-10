import { setCorsHeaders } from './cors.js';
import {
  createSessionCookie,
  createClearedSessionCookie,
  getSessionFromRequest,
} from './cookies.js';
import { readJson, sendJson } from './json.js';
import { isValidMapConfig } from '../world/enemy-areas.js';
import {
  createAccountId,
  createSession,
  hashPassword,
  validateCredentials,
  verifyPassword,
} from '../auth.js';

export function createRequestHandler({
  state,
  playerStore,
  logger,
  allowedOrigins,
  allowRequest,
  onMapConfigChanged,
}) {
  return async function handleRequest(request, response) {
    setCorsHeaders(request, response, allowedOrigins);

    if (typeof allowRequest === 'function' && !allowRequest(request)) {
      sendJson(response, 429, { error: 'Muitas requisicoes. Tente novamente em instantes.' }, {
        'retry-after': '60',
        connection: 'close',
      });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestUrl = new URL(
      request.url,
      `http://${request.headers.host ?? 'localhost'}`
    );

    const requestPath = requestUrl.pathname;

    if (request.method === 'GET' && requestPath === '/api/session') {
      const session = getSessionFromRequest(request, state.sessions);

      if (!session) {
        sendJson(response, 401, {
          authenticated: false,
        });
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
      sendJson(
        response,
        200,
        state.publishedMapConfig ?? {}
      );

      return;
    }

    if (request.method === 'PUT' && requestPath === '/api/map-config') {
      const session = getSessionFromRequest(
        request,
        state.sessions
      );

      if (!session?.isAdmin) {
        sendJson(response, 403, {
          error: 'Acesso restrito ao administrador.',
        });
        return;
      }

      try {
        const body = await readJson(request);

        if (!isValidMapConfig(body)) {
          sendJson(response, 400, {
            error: 'Configuracao de mapa invalida.',
          });
          return;
        }

        await playerStore.saveMapConfig(body);

        if (typeof onMapConfigChanged === 'function') {
          onMapConfigChanged(body);
        } else {
          state.publishedMapConfig = body;
        }

        sendJson(response, 200, {
          saved: true,
        });
      } catch (error) {
        sendJson(response, 400, {
          error: error.message,
        });
      }

      return;
    }

    if (request.method === 'GET' && requestPath === '/api/map-access') {
      const ticket = requestUrl.searchParams.get('ticket');

      const access = state.mapAccessTickets.get(ticket);

      const session = getSessionFromRequest(
        request,
        state.sessions
      );

      const authorized =
        access &&
        access.expiresAt > Date.now() &&
        session?.isAdmin &&
        session.userId === access.userId;

      if (!authorized) {
        sendJson(response, 403, {
          authorized: false,
        });
        return;
      }

      state.mapAccessTickets.delete(ticket);

      sendJson(response, 200, {
        authorized: true,
      });

      return;
    }

    if (request.method === 'POST' && requestPath === '/api/logout') {
      const session = getSessionFromRequest(
        request,
        state.sessions
      );

      if (session) {
        state.sessions.delete(session.token);
      }

      sendJson(
        response,
        200,
        {
          authenticated: false,
        },
        {
          'set-cookie': createClearedSessionCookie(request),
        }
      );

      return;
    }

    if (
      request.method === 'POST' &&
      ['/api/register', '/api/login'].includes(requestPath)
    ) {
      try {
        const body = await readJson(request);

        const nickname =
          typeof body.nickname === 'string'
            ? body.nickname.trim()
            : '';

        const password = body.password;

        const guestId =
          typeof body.guestId === 'string'
            ? body.guestId
            : null;

        if (!validateCredentials(nickname, password)) {
          sendJson(response, 400, {
            error: 'Nickname ou senha invalidos.',
          });
          return;
        }

        if (requestPath === '/api/register') {
          if (await playerStore.findUser(nickname)) {
            sendJson(response, 409, {
              error: 'Nickname indisponivel.',
            });
            return;
          }

          const user = {
            id: createAccountId(),
            nickname,
          };

          await playerStore.registerUser(
            user.id,
            nickname,
            await hashPassword(password)
          );

          await playerStore.migrateGuest(
            guestId,
            user.id,
            nickname
          );

          const session = createSession(user);

          state.sessions.set(
            session.token,
            session
          );

          sendJson(
            response,
            201,
            {
              nickname,
            },
            {
              'set-cookie': createSessionCookie(
                request,
                session.token
              ),
            }
          );

          return;
        }

        const user = await playerStore.findUser(nickname);

        if (
          !user ||
          !(await verifyPassword(
            password,
            user.password_hash
          ))
        ) {
          sendJson(response, 401, {
            error: 'Credenciais invalidas.',
          });
          return;
        }

        const session = createSession(user);

        state.sessions.set(
          session.token,
          session
        );

        sendJson(
          response,
          200,
          {
            nickname: user.nickname,
          },
          {
            'set-cookie': createSessionCookie(
              request,
              session.token
            ),
          }
        );
      } catch (error) {
        logger.warn('Falha na autenticacao', {
          error: error.message,
        });

        sendJson(response, 400, {
          error: 'Nao foi possivel processar a solicitacao.',
        });
      }

      return;
    }

    if (requestPath === '/') {
      const body = JSON.stringify({
        service: 'webgl-rpg-multiplayer',
        status: 'ok',
        websocket: 'ready',
        health: '/health',
      });

      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        connection: 'close',
      });

      if (request.method === 'HEAD') {
        response.end();
      } else {
        response.end(body);
      }

      return;
    }

    if (requestPath === '/health') {
      const body = JSON.stringify({
        status: state.databaseReady
          ? 'ok'
          : 'starting',
        players: state.players.size,
      });

      response.writeHead(
        state.databaseReady ? 200 : 503,
        {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          connection: 'close',
        }
      );

      if (request.method === 'HEAD') {
        response.end();
      } else {
        response.end(body);
      }

      return;
    }

    response.writeHead(404);
    response.end('Not found');
  };
}