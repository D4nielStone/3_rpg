export function createBroadcaster(
  socketServer,
  state,
  { intervalMs = 50, maxBufferedAmount = 256 * 1024 } = {},
) {
  let snapshotTimer = null;
  let snapshotPending = false;

  function sendToClients(serialized) {
    for (const client of socketServer.clients) {
      if (client.readyState !== 1) continue;
      if (client.bufferedAmount > maxBufferedAmount) {
        client.close(1013, 'Client too slow');
        continue;
      }
      client.send(serialized);
    }
  }

  function sendSnapshot() {
    sendToClients(JSON.stringify({
      type: 'snapshot',
      players: [...state.players.values()].map((player) => player.toSnapshot()),
      enemies: state.enemyAreas.flatMap((area) => area.toSnapshots()),
    }));
  }

  function broadcastSnapshot() {
    snapshotPending = true;
    if (snapshotTimer) return;

    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      if (!snapshotPending) return;
      snapshotPending = false;
      sendSnapshot();
    }, intervalMs);
  }

  function broadcast(message) {
    sendToClients(JSON.stringify(message));
  }

  return { broadcastSnapshot, broadcast };
}