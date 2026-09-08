import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Player } from './player.js';

const storePath = join(dirname(fileURLToPath(import.meta.url)), 'data', 'players.json');

export class PlayerStore {
  constructor() {
    this.players = this.load();
  }

  load() {
    try {
      return JSON.parse(readFileSync(storePath, 'utf8'));
    } catch {
      return {};
    }
  }

  get(guestId, peerId) {
    return new Player({ peerId, ...(this.players[guestId] ?? {}) });
  }

  save(guestId, player) {
    this.players[guestId] = player.toPersistence();
    mkdirSync(dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.players, null, 2)}\n`);
    renameSync(temporaryPath, storePath);
  }
}