import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommandManager } from '../server/multiplayer/commands.js';
import { Player } from '../server/player.js';

test('teleporta o jogador e atualiza o cliente alvo', async () => {
  const messages = [];
  const player = new Player({ peerId: 'peer-1', nickname: 'Hero' });
  const socket = { readyState: 1, send: (message) => messages.push(JSON.parse(message)) };
  const state = {
    players: new Map([['peer-1', player]]),
    activeGuestSessions: new Map([['user-1', { peerId: 'peer-1', socket }]]),
    physics: { teleportPlayer: (id, position) => { state.teleport = { id, position }; } },
  };
  const playerStore = { save: async () => {} };
  const commandManager = createCommandManager({
    state,
    playerStore,
    broadcastSnapshot: () => {},
  });

  await commandManager.execute('/tp 10 2 -4', {
    socket,
    peerId: 'peer-1',
    playerId: 'user-1',
    isAdmin: false,
    sendSystem: () => {},
  });

  assert.deepEqual(player.position, [10, 2, -4]);
  assert.deepEqual(state.teleport, { id: 'user-1', position: [10, 2, -4] });
  assert.deepEqual(messages[0], {
    type: 'teleported',
    position: [10, 2, -4],
    rotation: [0, 0, 0],
  });
});