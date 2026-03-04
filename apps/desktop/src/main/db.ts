import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

export type LocalOrm = BetterSQLite3Database<typeof schema>;

export type LocalDatabase = {
  sqlite: Database.Database;
  orm: LocalOrm;
};

export function initializeLocalDatabase(userDataPath: string): LocalDatabase {
  const dbPath = path.join(userDataPath, "slopify.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('active','paused','done','archived')),
      owner_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','member')),
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      PRIMARY KEY (project_id,user_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      seq INTEGER,
      actor_user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      server_created_at INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_event_id TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      assignee_user_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('open','done')),
      created_event_id TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      completed_by_user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS read_cursors (
      project_id TEXT PRIMARY KEY,
      last_read_seq INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_sync_state (
      project_id TEXT PRIMARY KEY,
      last_pulled_seq INTEGER NOT NULL,
      last_sync_at INTEGER,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_project_seq ON events(project_id, seq);
    CREATE INDEX IF NOT EXISTS idx_events_project_created_at ON events(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_sync_status_created_at ON events(sync_status, created_at);
  `);

  sqlite.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)").run("schema_version", "1");
  sqlite
    .prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)")
    .run("server_url", "http://127.0.0.1:4000");

  const orm = drizzle(sqlite, { schema });
  return { sqlite, orm };
}
