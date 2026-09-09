export const port = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 5174);
export const host = process.env.HOST ?? '0.0.0.0';
export const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'https://webgl-rpg-frontend.onrender.com';

export const allowedOrigins = new Set([
  frontendOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);