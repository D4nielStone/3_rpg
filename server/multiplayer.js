import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const port = Number(process.env.MULTIPLAYER_PORT ?? 5174);
const server = createServer();
const socketServer = new WebSocketServer({ server });
const players = new Map();

function isVector(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => Number.isFinite(item));
}

function broadcastSnapshot() {
  const snapshot = JSON.stringify({
    type: 'snapshot',
    players: [...players.values()],
  });
  for (const client of socketServer.clients) {
    if (client.readyState === 1) client.send(snapshot);
  }
}

socketServer.on('connection', (socket) => {
  const peerId = randomUUID();
  players.set(peerId, {
    peerId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  socket.send(JSON.stringify({ type: 'welcome', peerId }));
  broadcastSnapshot();

  socket.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      if (message.type !== 'state') return;
      const player = players.get(peerId);
      if (!player || !isVector(message.position) || !isVector(message.rotation)) return;
      player.position = message.position.slice(0, 3).map(Number);
      player.rotation = message.rotation.slice(0, 3).map(Number);
      broadcastSnapshot();
    } catch {
      // Ignore malformed client messages.
    }
  });

  socket.on('close', () => {
    players.delete(peerId);
    broadcastSnapshot();
  });
});

server.listen(port, () => {
  console.log(`Multiplayer relay listening on ws://localhost:${port}`);
});