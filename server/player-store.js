import pg from 'pg';
import { Player } from './player.js';

const { Pool } = pg;

export class PlayerStore {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
      throw new Error('DATABASE_URL nao configurada. O relay precisa de PostgreSQL.');
    }

    let databaseUrl;
    try {
      databaseUrl = new URL(connectionString);
    } catch {
      throw new Error('DATABASE_URL invalida. Use a connection string real do PostgreSQL.');
    }
    if (databaseUrl.hostname === 'host') {
      throw new Error('DATABASE_URL ainda usa o hostname de exemplo "host". Configure a URL real do PostgreSQL.');
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
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        nickname VARCHAR(20) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async get(guestId, peerId, nickname = 'Guest') {
    await this.ready;
    const result = await this.pool.query(
      'SELECT state FROM players WHERE guest_id = $1',
      [guestId],
    );
    return new Player({ peerId, nickname, ...(result.rows[0]?.state ?? {}) });
  }

  async registerUser(id, nickname, passwordHash) {
    await this.ready;
    await this.pool.query(
      'INSERT INTO users (id, nickname, password_hash) VALUES ($1, $2, $3)',
      [id, nickname, passwordHash],
    );
  }

  async findUser(nickname) {
    await this.ready;
    const result = await this.pool.query(
      'SELECT id, nickname, password_hash FROM users WHERE nickname = $1',
      [nickname],
    );
    return result.rows[0] ?? null;
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
