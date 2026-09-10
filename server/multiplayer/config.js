export const port = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 5174);
export const host = process.env.HOST ?? '0.0.0.0';
export const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'https://webgl-rpg-frontend.onrender.com';

export const allowedOrigins = new Set([
  frontendOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export const maxWebSocketConnections = Number(process.env.MAX_WS_CONNECTIONS ?? 100);
export const webSocketMaxPayload = Number(process.env.WS_MAX_PAYLOAD ?? 16 * 1024);
export const httpRequestsPerWindow = Number(process.env.HTTP_RATE_LIMIT ?? 120);
export const httpRateWindowMs = 60_000;