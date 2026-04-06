import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";

let sqlite: Database | null = null;

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

export const initDb = async (): Promise<void> => {
  sqlite = await Database.load("sqlite:slopify.sqlite");
  const statements = bootstrapSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await sqlite.execute(stmt + ";", []);
  }
};

export const getDb = (): Database => {
  if (sqlite === null) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return sqlite;
};

// Drizzle generates ON CONFLICT ("table"."column") but SQLite only accepts ON CONFLICT ("column").
// Strip table qualifiers from ON CONFLICT clauses.
const fixOnConflict = (sql: string): string =>
  sql.replace(/on conflict \(("[^"]+")\.("[^"]+")\)/gi, "on conflict ($2)");

// Drizzle's mapResultRow accesses row values by column INDEX (row[0], row[1], ...),
// but tauri-plugin-sql returns objects ({ column_name: value }).
// Extract column names from SELECT clause and reorder values to match.
const extractSelectColumns = (sql: string): string[] | null => {
  const match = sql.match(/^select\s+(.+?)\s+from\s/i);
  if (!match) return null;
  // Parse column list: handles "col", "table"."col", "col" as "alias", count(*), etc.
  const cols: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of match[1]!) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());

  return cols.map((col): string => {
    // "table"."col" → col (without quotes)
    const dotMatch = col.match(/"[^"]*"\."([^"]*)"/);
    if (dotMatch) return dotMatch[1]!;
    // "col" → col
    const quoted = col.match(/^"([^"]*)"$/);
    if (quoted) return quoted[1]!;
    // col as "alias" or col as alias → use original col name
    return col.replace(/\s+as\s+.*/i, "").replace(/"/g, "").trim();
  });
};

const rowToArray = (row: Record<string, unknown>, columns: string[] | null): unknown[] => {
  if (columns === null) return Object.values(row);
  return columns.map((col) => row[col]);
};

export const db = drizzle(async (sql, params, method) => {
  const s = getDb();
  const fixedSql = fixOnConflict(sql);
  if (method === "all") {
    const rows = await s.select(fixedSql, params as unknown[]) as Record<string, unknown>[];
    const columns = rows.length > 0 ? extractSelectColumns(fixedSql) : null;
    return { rows: rows.map((r) => rowToArray(r, columns)) };
  }
  if (method === "get") {
    const rows = await s.select(fixedSql, params as unknown[]) as Record<string, unknown>[];
    const first = rows[0];
    if (!first) return { rows: [] };
    const columns = extractSelectColumns(fixedSql);
    return { rows: rowToArray(first, columns) };
  }
  await s.execute(fixedSql, params as unknown[]);
  return { rows: [] };
});

export const rawQuery = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
  const s = getDb();
  return (await s.select(sql, params ?? [])) as T[];
};

export const rawExecute = async (sql: string, params?: unknown[]): Promise<void> => {
  const s = getDb();
  await s.execute(sql, params ?? []);
};
