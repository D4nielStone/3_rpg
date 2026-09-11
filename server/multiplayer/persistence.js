export function createPlayerPersistence({ playerStore, logger, delayMs = 500 }) {
  const playerSaveTimers = new Map();
  const pendingPlayerSaves = new Map();

  function queuePlayerSave(playerId, player) {
    pendingPlayerSaves.set(playerId, player);

    if (playerSaveTimers.has(playerId)) return;

    const timer = setTimeout(async () => {
      playerSaveTimers.delete(playerId);
      const pendingPlayer = pendingPlayerSaves.get(playerId);
      pendingPlayerSaves.delete(playerId);

      if (!pendingPlayer) return;

      try {
        await playerStore.save(playerId, pendingPlayer);
      } catch (error) {
        logger.error('Falha ao salvar jogador', {
          playerId,
          error: error.message,
        });
        queuePlayerSave(playerId, pendingPlayer);
      }

      if (pendingPlayerSaves.has(playerId)) {
        queuePlayerSave(playerId, pendingPlayerSaves.get(playerId));
      }
    }, delayMs);

    playerSaveTimers.set(playerId, timer);
  }

  function savePlayer(playerId, player) {
    return playerStore.save(playerId, player);
  }

  return { queuePlayerSave, savePlayer };
}
