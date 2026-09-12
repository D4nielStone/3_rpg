import { randomUUID } from 'node:crypto';
import { CommandManager } from '../command-manager.js';
import { sendSystemMessage, resolvePlayerTarget } from './utils.js';
import { promotePlayerToAreaTwo } from './player-actions.js';

export function createCommandManager({ state, playerStore, broadcastSnapshot }) {
  const commandManager = new CommandManager();

  commandManager
    .register('help', {
      description: 'Lista os comandos disponíveis',
      execute: ({ socket, isAdmin }) => sendSystemMessage(socket, commandManager.help(isAdmin)),
    })
    .register('map', {
      scope: 'admin',
      description: 'Abre o editor de mapas',
      execute: ({ socket, playerId }) => {
        const ticket = randomUUID();
        state.mapAccessTickets.set(ticket, { userId: playerId, expiresAt: Date.now() + 60_000 });
        socket.send(JSON.stringify({ type: 'map-access', path: `/map-editor.html?access=${ticket}` }));
      },
    })
    .register('xp', {
      scope: 'admin',
      description: 'Adiciona XP a um jogador: /xp quantidade @jogador',
      execute: async ({ socket, peerId, playerId, command }) => {
        const amount = Number(command.args[0]);
        const targetName = command.args[1] ?? '@p';
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000) return sendSystemMessage(socket, 'Quantidade de XP inválida.');
        const target = resolvePlayerTarget(targetName, peerId, playerId, state);
        if (!target?.player) return sendSystemMessage(socket, `Jogador nao encontrado: ${targetName}`);
        const leveledUp = target.player.addExperience(amount);
        const promoted = leveledUp && promotePlayerToAreaTwo(target.player, state);
        let message = `+${amount} XP para ${target.player.nickname}${leveledUp ? '. Level aumentado.' : '.'}`;
        if (promoted) message += ' Teletransportado para a Área dos Ratos 2.';
        if (leveledUp) sendSystemMessage(state.activeGuestSessions.get(target.playerId)?.socket, `Você subiu para o level ${target.player.level}! Vida e mana restauradas para 100%.`);
        await playerStore.save(target.playerId, target.player);
        sendSystemMessage(socket, message);
        broadcastSnapshot();
      },
    })
    .register('tp', {
      description: 'Teletransporta um jogador: /tp [@jogador] x y z',
      execute: async ({ socket, peerId, playerId, command }) => {
        let targetName = '@p';
        let coordinateIndex = 0;

        if (command.args[0]?.startsWith('@')) {
          targetName = command.args[0];
          coordinateIndex = 1;
        }

        if (command.args.length - coordinateIndex !== 3) {
          return sendSystemMessage(
            socket,
            'Uso: /tp [@jogador] x y z'
          );
        }

        const x = Number(command.args[coordinateIndex]);
        const y = Number(command.args[coordinateIndex + 1]);
        const z = Number(command.args[coordinateIndex + 2]);

        if (![x, y, z].every(Number.isFinite)) {
          return sendSystemMessage(
            socket,
            'As coordenadas devem ser números válidos.'
          );
        }

        const target = resolvePlayerTarget(
          targetName,
          peerId,
          playerId,
          state
        );

        if (!target?.player) {
          return sendSystemMessage(
            socket,
            `Jogador não encontrado: ${targetName}`
          );
        }

        target.player.setTransform(
          [x, y, z],
          target.player.rotation
        );
        state.physics.teleportPlayer(target.playerId, [x, y, z]);

        await playerStore.save(
          target.playerId,
          target.player
        );

        const targetSession = state.activeGuestSessions.get(target.playerId);
        targetSession?.socket?.send(JSON.stringify({
          type: 'teleported',
          position: [x, y, z],
          rotation: [...target.player.rotation],
        }));

        sendSystemMessage(
          socket,
          `${target.player.nickname} foi teletransportado para ${x}, ${y}, ${z}.`
        );

        broadcastSnapshot();
      },
    })
    .register('hp', {
      scope: 'admin',
      description: 'Adiciona vida a um jogador: /hp quantidade @jogador',
      execute: async ({ socket, peerId, playerId, command }) => {
        const amount = Number(command.args[0]);
        const targetName = command.args[1] ?? '@p';
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000) return sendSystemMessage(socket, 'Quantidade de HP inválida.');
        const target = resolvePlayerTarget(targetName, peerId, playerId, state);
        if (!target?.player) return sendSystemMessage(socket, `Jogador nao encontrado: ${targetName}`);
        target.player.hp = Math.min(target.player.maxHp, target.player.hp + amount);
        await playerStore.save(target.playerId, target.player);
        sendSystemMessage(socket, `+${amount} HP para ${target.player.nickname}.`);
        broadcastSnapshot();
      },
    });

  return commandManager;
}