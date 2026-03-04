import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type ServerConfig = {
  port: number;
  databaseUrl: string;
  serverAccessPassword: string;
};

const readConfig = (): ServerConfig => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    port: Number(process.env.PORT ?? "4000"),
    databaseUrl,
    serverAccessPassword: process.env.SERVER_ACCESS_PASSWORD ?? "change-me",
  };
};

const bootstrapSql = `
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_channels (
  chat_channel_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS docs (
  doc_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_comments (
  comment_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  anchor TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chat_channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chat_channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  chat_channel_id TEXT,
  doc_id TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_project_created_at ON events(project_id, created_at);

CREATE TABLE IF NOT EXISTS invites (
  invite_code TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
`;

export const createServerDb = async (): Promise<{
  db: ReturnType<typeof drizzle>;
  pool: Pool;
  config: ServerConfig;
}> => {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query(bootstrapSql);
  const db = drizzle(pool);
  return { db, pool, config };
};
