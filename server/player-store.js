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

    const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname);

    this.pool = new Pool({
      connectionString,
      ssl: !isLocalDatabase ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
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
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS world_configs (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        config JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async get(guestId, peerId, nickname = 'Guest') {
    await this.ready;
    const result = await this.pool.query(
      'SELECT state FROM players WHERE guest_id = $1',
      [guestId],
    );
    return new Player({ peerId, ...(result.rows[0]?.state ?? {}), nickname });
  }

  async registerUser(id, nickname, passwordHash) {
    await this.ready;
    await this.pool.query(
      'INSERT INTO users (id, nickname, password_hash) VALUES ($1, $2, $3)',
      [id, nickname, passwordHash],
    );
  }

  async migrateGuest(guestId, userId, nickname) {
    if (!/^[0-9a-f-]{36}$/i.test(guestId ?? '')) return false;
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT state FROM players WHERE guest_id = $1 FOR UPDATE',
        [guestId],
      );
      if (!result.rows[0]) {
        await client.query('COMMIT');
        return false;
      }
      const state = { ...result.rows[0].state, nickname };
      await client.query(`
        INSERT INTO players (guest_id, state, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (guest_id)
        DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
      `, [userId, JSON.stringify(state)]);
      await client.query('DELETE FROM players WHERE guest_id = $1', [guestId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findUser(nickname) {
    await this.ready;
    const result = await this.pool.query(
      'SELECT id, nickname, password_hash, is_admin FROM users WHERE nickname = $1',
      [nickname],
    );
    return result.rows[0] ?? null;
  }

  async getRanking(limit = 10) {
    await this.ready;
    const result = await this.pool.query(`
      SELECT
        state->>'nickname' AS nickname,
        COALESCE((state->>'level')::int, 1) AS level,
        COALESCE((state->>'xp')::int, 0) AS xp
      FROM players
      ORDER BY level DESC, xp DESC, nickname ASC
      LIMIT $1
    `, [limit]);
    return result.rows;
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

  async getMapConfig() {
    await this.ready;
    const result = await this.pool.query('SELECT config FROM world_configs WHERE id = 1');
    return result.rows[0]?.config ?? null;
  }

  async saveMapConfig(config) {
    await this.ready;
    await this.pool.query(`
      INSERT INTO world_configs (id, config, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
    `, [JSON.stringify(config)]);
  }
}
