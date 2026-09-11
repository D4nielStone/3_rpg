import pg from 'pg';
import { Player } from './player.js';

const { Pool } = pg;

export class PlayerStore {
  constructor(connectionString = process.env.DATABASE_URL) {
    // A conexão com o PostgreSQL é obrigatória.
    if (!connectionString) {
      throw new Error('DATABASE_URL nao configurada. O relay precisa de PostgreSQL.');
    }

    let databaseUrl;

    try {
      // Converte a connection string em URL para podermos validar o endereço.
      databaseUrl = new URL(connectionString);
    } catch {
      throw new Error('DATABASE_URL invalida. Use uma connection string real do PostgreSQL.');
    }

    // Evita que a aplicação seja iniciada com o hostname de exemplo.
    if (databaseUrl.hostname === 'host') {
      throw new Error('DATABASE_URL ainda usa o hostname de exemplo "host". Configure a URL real do PostgreSQL.');
    }

    // Conexões locais não precisam de SSL.
    // Para bancos externos, utilizamos SSL.
    const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname);

    // Cria o pool de conexões com o PostgreSQL.
    this.pool = new Pool({
      connectionString,
      ssl: !isLocalDatabase ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });

    // Inicializa as tabelas antes que qualquer operação seja realizada.
    this.ready = this.initialize();
  }

  async initialize() {
    // Armazena o estado persistente dos jogadores.
    // O estado completo do Player é armazenado em JSONB.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        guest_id UUID PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Armazena as contas registradas.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        nickname VARCHAR(20) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Garante que bancos criados em versões anteriores também possuam
    // a coluna utilizada para identificar administradores.
    await this.pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Armazena a configuração publicada do mundo/mapa.
    // Existe apenas uma configuração ativa, identificada pelo id 1.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS world_configs (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        config JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async get(guestId, peerId, nickname = 'Guest', playerDefinition = {}) {
    await this.ready;

    const initialPlayer = new Player({
      peerId,
      nickname,
      ...(playerDefinition.status ?? {}),
      inventory: playerDefinition.inventory,
    });

    // A criacao e atomica: conexoes simultaneas para o mesmo jogador
    // disputam a mesma chave primaria e reutilizam a primeira linha.
    await this.pool.query(`
      INSERT INTO players (guest_id, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (guest_id) DO NOTHING
    `, [guestId, JSON.stringify(initialPlayer.toPersistence())]);

    // Procura o estado persistente do jogador pelo seu UUID.
    const result = await this.pool.query(
      'SELECT state FROM players WHERE guest_id = $1',
      [guestId],
    );

    // Cria uma nova instância de Player utilizando o estado salvo.
    // Caso ainda não exista um estado, o Player utiliza seus valores padrão.
    return new Player({
      peerId,
      ...(result.rows[0]?.state ?? {}),
      nickname,
      ...(!result.rows[0] ? playerDefinition.status : {}),
      inventory: result.rows[0]?.state?.inventory ?? playerDefinition.inventory,
    });
  }

  async registerUser(id, nickname, passwordHash) {
    await this.ready;

    // Cria uma nova conta de usuário.
    // A senha já deve chegar aqui como hash, nunca em texto puro.
    await this.pool.query(
      'INSERT INTO users (id, nickname, password_hash) VALUES ($1, $2, $3)',
      [id, nickname, passwordHash],
    );
  }

  async migrateGuest(guestId, userId, nickname) {
    // Se o identificador do convidado não for um UUID válido,
    // não existe uma conta de convidado válida para migrar.
    if (!/^[0-9a-f-]{36}$/i.test(guestId ?? '')) return false;

    await this.ready;

    // Obtém uma conexão exclusiva do pool.
    // Ela é necessária porque a migração utiliza uma transação.
    const client = await this.pool.connect();

    try {
      // Inicia uma transação para garantir que todas as alterações
      // aconteçam juntas.
      await client.query('BEGIN');

      // Bloqueia o registro enquanto ele está sendo migrado.
      const result = await client.query(
        'SELECT state FROM players WHERE guest_id = $1 FOR UPDATE',
        [guestId],
      );

      // Não existe estado salvo para esse convidado.
      if (!result.rows[0]) {
        await client.query('COMMIT');
        return false;
      }

      // Mantém o estado antigo, mas atualiza o nickname para o da conta.
      const state = {
        ...result.rows[0].state,
        nickname,
      };

      // Salva o estado utilizando o ID da conta registrada.
      await client.query(`
        INSERT INTO players (guest_id, state, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (guest_id)
        DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
      `, [userId, JSON.stringify(state)]);

      // Remove o estado associado ao antigo guest ID.
      await client.query('DELETE FROM players WHERE guest_id = $1', [guestId]);

      // Confirma todas as alterações.
      await client.query('COMMIT');

      return true;
    } catch (error) {
      // Se qualquer operação falhar, desfaz todas as alterações.
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Devolve a conexão ao pool.
      client.release();
    }
  }

  async findUser(nickname) {
    await this.ready;

    // Procura uma conta pelo nickname.
    const result = await this.pool.query(
      'SELECT id, nickname, password_hash, is_admin FROM users WHERE nickname = $1',
      [nickname],
    );

    // Retorna o usuário encontrado ou null caso não exista.
    return result.rows[0] ?? null;
  }

  async getRanking(limit = 10) {
    await this.ready;

    // Extrai os dados necessários diretamente do JSONB.
    // O ranking é ordenado primeiro pelo nível e depois pela XP.
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

    // Converte o estado do Player para o formato persistente
    // e salva no PostgreSQL.
    //
    // INSERT cria o jogador caso ele ainda não exista.
    // ON CONFLICT atualiza o estado caso o jogador já exista.
    await this.pool.query(`
      INSERT INTO players (guest_id, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (guest_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `, [
      guestId,
      JSON.stringify(player.toPersistence()),
    ]);
  }

  async getMapConfig() {
    await this.ready;

    // Recupera a configuração atualmente publicada do mundo.
    const result = await this.pool.query(
      'SELECT config FROM world_configs WHERE id = 1',
    );

    // Caso ainda não exista uma configuração, retorna null.
    return result.rows[0]?.config ?? null;
  }

  async saveMapConfig(config) {
    await this.ready;

    // Salva ou substitui a configuração do mapa.
    //
    // Como a tabela possui apenas o registro com id = 1,
    // sempre trabalhamos com a configuração atualmente publicada.
    await this.pool.query(`
      INSERT INTO world_configs (id, config, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()
    `, [
      JSON.stringify(config),
    ]);
  }
}