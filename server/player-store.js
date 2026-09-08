import pg from 'pg';
import { Player } from './player.js';

const { Pool } = pg;

export class PlayerStore {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
      throw new Error('DATABASE_URL nao configurada. O relay precisa de PostgreSQL.');
    }

    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
    this.ready = this.initialize();
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        guest_id UUID PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async get(guestId, peerId) {
    await this.ready;
    const result = await this.pool.query(
      'SELECT state FROM players WHERE guest_id = $1',
      [guestId],
    );
    return new Player({ peerId, ...(result.rows[0]?.state ?? {}) });
  }

  async save(guestId, player) {
    await this.ready;
    await this.pool.query(`
      INSERT INTO players (guest_id, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (guest_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `, [guestId, JSON.stringify(player.toPersistence())]);
  }
}
