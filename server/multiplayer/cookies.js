export function createSessionCookie(request, token) {
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

export function createClearedSessionCookie(request) {
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

export function getSessionFromRequest(request, sessions) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith('webgl_session='));
  const token = sessionCookie?.split('=').slice(1).join('=').trim();
  return token ? sessions.get(token) ?? null : null;
}