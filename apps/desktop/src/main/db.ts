import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export type LocalDb = ReturnType<typeof drizzle>;

const bootstrapSql = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_channels (
  chat_channel_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS docs (
  doc_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_comments (
  comment_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  anchor TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chat_channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chat_channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  chat_channel_id TEXT,
  doc_id TEXT,
  created_at INTEGER NOT NULL,
  sync_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  project_id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_read_cursors (
  project_id TEXT PRIMARY KEY,
  last_read_at INTEGER NOT NULL
);

-- 旧クライアントが保存した時刻ベースカーソルを server_seq モードへ移行する。
UPDATE app_meta
SET value = '0'
WHERE key = 'last_pulled_at'
  AND CAST(value AS INTEGER) > 10000000000;

CREATE INDEX IF NOT EXISTS idx_events_project_created_at ON events(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_sync_status ON events(sync_status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_channels_project ON chat_channels(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_project ON docs(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_comments_doc ON doc_comments(doc_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_chat_channel ON events(chat_channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_doc ON events(doc_id, created_at);
CREATE INDEX IF NOT EXISTS idx_doc_comments_project_doc ON doc_comments(project_id, doc_id, created_at);
`;

export const createLocalDb = (dataDir: string): { db: LocalDb; sqlite: Database.Database } => {
  const dbPath = path.join(dataDir, "slopify.sqlite");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(bootstrapSql);
  const db = drizzle(sqlite);
  return { db, sqlite };
};
