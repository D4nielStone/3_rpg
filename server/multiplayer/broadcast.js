export function createBroadcaster(socketServer, state) {
  function broadcastSnapshot() {
    // O relay mantem somente o estado temporario dos jogadores conectados.
    const snapshot = JSON.stringify({
      type: 'snapshot',
      players: [...state.players.values()].map((player) => player.toSnapshot()),
      enemies: state.enemyAreas.flatMap((area) => area.toSnapshots()),
    });
    for (const client of socketServer.clients) {
      if (client.readyState === 1) client.send(snapshot);
    }
  }

  function broadcast(message) {
    const serialized = JSON.stringify(message);
    for (const client of socketServer.clients) {
      if (client.readyState === 1) client.send(serialized);
    }
  }

  return { broadcastSnapshot, broadcast };
}