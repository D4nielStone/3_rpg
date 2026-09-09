import { createEnemyAreas } from '../world/enemy-areas.js';

export class GameState {
  constructor() {
    this.players = new Map(); // peerId -> Player
    this.activeGuestSessions = new Map(); // playerId -> { peerId, socket }
    this.sessions = new Map(); // token -> session
    this.mapAccessTickets = new Map(); // ticket -> { userId, expiresAt }
    this.publishedMapConfig = null;
    this.enemyAreas = createEnemyAreas();
    this.databaseReady = false;
  }

  setMapConfig(config) {
    this.publishedMapConfig = config;
    this.enemyAreas = createEnemyAreas(config);
  }

  findPlayerArea(position) {
    return this.enemyAreas.find((area) => area.contains(position)) ?? null;
  }

  getPlayerIdByPeerId(peerId) {
    for (const [playerId, session] of this.activeGuestSessions) {
      if (session.peerId === peerId) return playerId;
    }
    return null;
  }
}