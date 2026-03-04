import { Pool } from "pg";

const connectionString = process.env.SYNC_DATABASE_URL ?? "postgres://localhost:5432/slopify_sync";

export const pool = new Pool({ connectionString });

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('active','paused','done','archived')),
      owner_user_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      archived_at BIGINT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','member')),
      joined_at BIGINT NOT NULL,
      left_at BIGINT,
      PRIMARY KEY (project_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      seq BIGINT NOT NULL,
      actor_user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      server_created_at BIGINT NOT NULL
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_project_seq ON events(project_id, seq);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_sequences (
      project_id TEXT PRIMARY KEY,
      last_seq BIGINT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);
}
