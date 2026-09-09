import { randomUUID } from 'node:crypto';

export function getConnectionIdentity(requestUrl, requestHeaders = {}, sessions) {
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

export function isVector(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => Number.isFinite(item));
}

export function isChatMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

export function getUserLabel(peerId, nickname) {
  return nickname || `Usuário ${peerId.slice(0, 6)}`;
}

export function resolvePlayerTarget(selector, requesterPeerId, requesterPlayerId, state) {
  if (selector.toLowerCase() === '@p') {
    return {
      player: state.players.get(requesterPeerId),
      playerId: requesterPlayerId,
    };
  }

  const nickname = selector.startsWith('@') ? selector.slice(1).trim() : '';
  if (!nickname) return null;

  for (const [peerId, player] of state.players) {
    if (player.nickname.toLowerCase() !== nickname.toLowerCase()) continue;
    const session = [...state.activeGuestSessions.entries()]
      .find(([, active]) => active.peerId === peerId);
    return session ? { player, playerId: session[0] } : null;
  }
  return null;
}

export function sendSystemMessage(socket, text) {
  if (socket?.readyState !== 1) return;
  socket.send(JSON.stringify({
    type: 'system',
    text,
    sentAt: Date.now(),
  }));
}