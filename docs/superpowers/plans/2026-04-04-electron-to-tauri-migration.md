# Electron to Tauri v2 Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Electron shell with Tauri v2 while keeping all business logic in TypeScript/WebView.

**Architecture:** Business logic (repository, sync-client, event sourcing) moves from Electron main process into the WebView as plain TS modules. Tauri Rust core handles only OS features (notifications, clipboard, idle detection). SQLite access goes through tauri-plugin-sql with Drizzle sqlite-proxy adapter.

**Tech Stack:** Tauri v2, tauri-plugin-sql, Drizzle ORM (sqlite-proxy), socket.io-client (browser), React 18, Zustand 4, Vite 5, Tailwind CSS v4

---

### Task 1: Scaffold Tauri project in apps/desktop

**Files:**
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/commands.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Create: `apps/desktop/src-tauri/build.rs`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install Tauri CLI and prerequisites**

```bash
cd /home/andy/project/vibe/Slopify
npm install -D @tauri-apps/cli@^2 -w apps/desktop
```

- [ ] **Step 2: Create Cargo.toml**

```toml
# apps/desktop/src-tauri/Cargo.toml
[package]
name = "slopify"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-notification = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-os = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
arboard = "3"
base64 = "0.22"
user-idle = "0.6"
```

- [ ] **Step 3: Create build.rs**

```rust
// apps/desktop/src-tauri/build.rs
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Create main.rs with plugin registration**

```rust
// apps/desktop/src-tauri/src/main.rs
mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_system_idle_time,
            commands::read_clipboard_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Create commands.rs with OS feature commands**

```rust
// apps/desktop/src-tauri/src/commands.rs
use arboard::Clipboard;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

#[tauri::command]
pub fn get_system_idle_time() -> u64 {
    match user_idle::UserIdle::get_time() {
        Ok(idle) => idle.as_seconds(),
        Err(_) => 0,
    }
}

#[tauri::command]
pub fn read_clipboard_image() -> Option<String> {
    let mut clipboard = Clipboard::new().ok()?;
    let image = clipboard.get_image().ok()?;
    let rgba = image.bytes.into_owned();

    // Encode as PNG
    let mut png_data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_data, image.width as u32, image.height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }

    let b64 = STANDARD.encode(&png_data);
    Some(format!("data:image/png;base64,{}", b64))
}
```

Update Cargo.toml to add png dependency:

```toml
# Add to [dependencies] in Cargo.toml
png = "0.17"
```

- [ ] **Step 6: Create tauri.conf.json**

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/config.schema.json",
  "productName": "Slopify",
  "version": "0.1.0",
  "identifier": "com.slopify.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev:vite",
    "beforeBuildCommand": "npm run build:vite"
  },
  "app": {
    "windows": [
      {
        "title": "Slopify",
        "width": 1280,
        "height": 860,
        "minWidth": 960,
        "minHeight": 640
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "sql": {
      "preload": ["sqlite:slopify.sqlite"]
    }
  }
}
```

- [ ] **Step 7: Create capabilities/default.json**

```json
{
  "identifier": "default",
  "description": "Default permissions for Slopify",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close",
    "notification:default",
    "notification:allow-notify",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "clipboard-manager:default",
    "clipboard-manager:allow-read-image",
    "os:default",
    "shell:default"
  ]
}
```

- [ ] **Step 8: Create placeholder icons directory**

```bash
mkdir -p apps/desktop/src-tauri/icons
# Copy existing icons or create placeholders
cp apps/desktop/build/icon.png apps/desktop/src-tauri/icons/128x128.png 2>/dev/null || echo "Will need icons later"
```

- [ ] **Step 9: Install Tauri JS dependencies and update package.json scripts**

```bash
cd /home/andy/project/vibe/Slopify
npm install @tauri-apps/api@^2 @tauri-apps/plugin-sql@^2 @tauri-apps/plugin-notification@^2 @tauri-apps/plugin-clipboard-manager@^2 @tauri-apps/plugin-os@^2 @tauri-apps/plugin-shell@^2 -w apps/desktop
```

Update `apps/desktop/package.json` scripts — replace Electron scripts with Tauri scripts:

```json
{
  "scripts": {
    "dev": "npm run dev:tauri",
    "dev:vite": "vite",
    "dev:tauri": "tauri dev",
    "build:vite": "vite build",
    "build": "npm run build:vite",
    "dist": "tauri build",
    "dist:linux": "tauri build --target x86_64-unknown-linux-gnu",
    "dist:mac": "tauri build --target universal-apple-darwin",
    "dist:win": "tauri build --target x86_64-pc-windows-msvc"
  }
}
```

- [ ] **Step 10: Commit scaffold**

```bash
git add apps/desktop/src-tauri/ apps/desktop/package.json
git commit -m "feat: scaffold Tauri v2 project alongside Electron"
```

---

### Task 2: Create the SQLite adapter layer (src/core/db.ts)

**Files:**
- Create: `apps/desktop/src/core/db.ts`
- Copy: `apps/desktop/src/main/schema.ts` → `apps/desktop/src/core/schema.ts`

- [ ] **Step 1: Copy Drizzle schema unchanged**

Copy `apps/desktop/src/main/schema.ts` to `apps/desktop/src/core/schema.ts` with no modifications. The Drizzle table definitions work with any SQLite driver.

```bash
mkdir -p apps/desktop/src/core
cp apps/desktop/src/main/schema.ts apps/desktop/src/core/schema.ts
```

- [ ] **Step 2: Create db.ts with tauri-plugin-sql + Drizzle sqlite-proxy**

```typescript
// apps/desktop/src/core/db.ts
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
  // Run bootstrap — split on semicolons because plugin executes one statement at a time
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

export const db = drizzle(async (sql, params, method) => {
  const s = getDb();
  if (method === "all" || method === "get") {
    const rows = await s.select(sql, params as unknown[]);
    return { rows: rows as Record<string, unknown>[] };
  }
  await s.execute(sql, params as unknown[]);
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
```

- [ ] **Step 3: Install drizzle-orm sqlite-proxy dependency (already present via drizzle-orm)**

The `drizzle-orm` package already includes `drizzle-orm/sqlite-proxy`. No extra install needed — it's already a dependency.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/core/db.ts apps/desktop/src/core/schema.ts
git commit -m "feat: add Tauri SQLite adapter with Drizzle sqlite-proxy"
```

---

### Task 3: Create native.ts — Tauri OS feature wrappers

**Files:**
- Create: `apps/desktop/src/core/native.ts`

- [ ] **Step 1: Create native.ts**

```typescript
// apps/desktop/src/core/native.ts
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export const showNotification = async (title: string, body: string): Promise<void> => {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }
  if (permissionGranted) {
    sendNotification({ title: `Slopify — ${title}`, body });
  }
};

export const getSystemIdleTime = async (): Promise<number> => {
  return await invoke<number>("get_system_idle_time");
};

export const readClipboardImage = async (): Promise<string | null> => {
  return await invoke<string | null>("read_clipboard_image");
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/core/native.ts
git commit -m "feat: add native.ts Tauri OS feature wrappers"
```

---

### Task 4: Move and adapt sync-client.ts

**Files:**
- Copy+modify: `apps/desktop/src/main/sync-client.ts` → `apps/desktop/src/core/sync-client.ts`

- [ ] **Step 1: Copy sync-client.ts to core/**

```bash
cp apps/desktop/src/main/sync-client.ts apps/desktop/src/core/sync-client.ts
```

- [ ] **Step 2: Remove Node.js-specific imports if any**

The current sync-client.ts only imports from `socket.io-client` and `@slopify/shared` — both work in browser environments. No changes needed to the file content. Verify:

```bash
head -3 apps/desktop/src/core/sync-client.ts
# Should show:
# import { io, type Socket } from "socket.io-client";
# import type { EventRecord, Settings, UserPresence } from "@slopify/shared";
```

No Node.js-specific imports exist. The file works as-is in the WebView.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/core/sync-client.ts
git commit -m "feat: move sync-client.ts to core/ (no changes needed)"
```

---

### Task 5: Adapt repository.ts for WebView + async DB

This is the largest task. The repository moves from Electron main process to WebView. All synchronous `sqlite.prepare()` calls become async `rawQuery()`/`rawExecute()` calls. The `EventEmitter` becomes a simple callback pattern.

**Files:**
- Create: `apps/desktop/src/core/repository.ts` (adapted from `apps/desktop/src/main/repository.ts`)

- [ ] **Step 1: Create the adapted repository.ts**

Copy `apps/desktop/src/main/repository.ts` to `apps/desktop/src/core/repository.ts`, then apply these systematic changes:

**1a. Imports — replace Electron/Node.js imports with core/ imports:**

Old:
```typescript
import { EventEmitter } from "node:events";
import type Database from "better-sqlite3";
import type { LocalDb } from "./db.js";
import { appMeta, chatChannels, decisions, docComments, docs, events, invites, projectMembers, projectReadCursors, projects, tasks, users } from "./schema.js";
import { SyncClient } from "./sync-client.js";
```

New:
```typescript
import { db, rawQuery, rawExecute } from "./db.js";
import { appMeta, chatChannels, decisions, docComments, docs, events, invites, projectMembers, projectReadCursors, projects, tasks, users } from "./schema.js";
import { SyncClient } from "./sync-client.js";
```

**1b. Replace TypedEmitter with simple callback pattern:**

Old:
```typescript
class TypedEmitter {
  private readonly emitter = new EventEmitter();
  public on<K extends keyof SyncEmitterEvents>(eventName: K, listener: ...): () => void { ... }
  public emit<K extends keyof SyncEmitterEvents>(eventName: K, payload: ...): void { ... }
}
```

New:
```typescript
type Listener<T> = (payload: T) => void;

class TypedEmitter {
  private listeners: { [K in keyof SyncEmitterEvents]?: Array<Listener<SyncEmitterEvents[K]>> } = {};

  public on<K extends keyof SyncEmitterEvents>(
    eventName: K,
    listener: Listener<SyncEmitterEvents[K]>,
  ): () => void {
    if (this.listeners[eventName] === undefined) {
      this.listeners[eventName] = [];
    }
    (this.listeners[eventName] as Array<Listener<SyncEmitterEvents[K]>>).push(listener);
    return () => {
      const arr = this.listeners[eventName] as Array<Listener<SyncEmitterEvents[K]>> | undefined;
      if (arr !== undefined) {
        const idx = arr.indexOf(listener);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  public emit<K extends keyof SyncEmitterEvents>(eventName: K, payload: SyncEmitterEvents[K]): void {
    const arr = this.listeners[eventName] as Array<Listener<SyncEmitterEvents[K]>> | undefined;
    if (arr !== undefined) {
      for (const fn of arr) fn(payload);
    }
  }
}
```

**1c. Constructor — remove db/sqlite params, use module-level db:**

Old:
```typescript
public constructor(
  private readonly db: LocalDb,
  private readonly sqlite: Database.Database,
  private readonly appVersion: string = "unknown",
) {}
```

New:
```typescript
public constructor(
  private readonly appVersion: string = "unknown",
) {}
```

**1d. All `this.db.xxx()` calls → `db.xxx()` (module-level import), and all sync `.get()`/`.all()`/`.run()` calls add `await`:**

Every Drizzle call changes from `this.db.xxx().yyy().run()` to `await db.xxx().yyy().run()`. Since Drizzle sqlite-proxy is inherently async, all these calls already return Promises.

Key patterns to replace throughout:

| Old pattern | New pattern |
|---|---|
| `this.db.select().from(X).where(Y).get()` | `await db.select().from(X).where(Y).get()` |
| `this.db.select().from(X).where(Y).all()` | `await db.select().from(X).where(Y).all()` |
| `this.db.insert(X).values(Y).run()` | `await db.insert(X).values(Y).run()` |
| `this.db.insert(X).values(Y).onConflictDoUpdate(Z).run()` | `await db.insert(X).values(Y).onConflictDoUpdate(Z).run()` |
| `this.db.insert(X).values(Y).onConflictDoNothing().run()` | `await db.insert(X).values(Y).onConflictDoNothing().run()` |
| `this.db.update(X).set(Y).where(Z).run()` | `await db.update(X).set(Y).where(Z).run()` |
| `this.db.delete(X).where(Y).run()` | `await db.delete(X).where(Y).run()` |

**1e. All `this.sqlite.prepare(sql).all(params)` → `await rawQuery(sql, params)`:**

Example — `listProjects`:

Old:
```typescript
const rows = this.sqlite.prepare(`SELECT ...`).all(myUserId ?? "") as Array<{...}>;
```

New:
```typescript
const rows = await rawQuery<{...}>(`SELECT ...`, [myUserId ?? ""]);
```

**1f. All `this.sqlite.prepare(sql).get(params)` → `(await rawQuery(sql, params))[0]`:**

Example — `requireProject`:

Old:
```typescript
const row = this.sqlite.prepare(`SELECT ...`).get(projectId, projectId, projectId) as {...} | undefined;
```

New:
```typescript
const rows = await rawQuery<{...}>(`SELECT ...`, [projectId, projectId, projectId]);
const row = rows[0];
```

**1g. All `this.sqlite.prepare(sql).run(params)` → `await rawExecute(sql, params)`:**

Example — `openWorkspace` read cursor:

Old:
```typescript
this.sqlite.prepare(`INSERT INTO project_read_cursors ...`).run(projectId, Date.now());
```

New:
```typescript
await rawExecute(`INSERT INTO project_read_cursors (project_id, last_read_at) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET last_read_at = excluded.last_read_at`, [projectId, Date.now()]);
```

**1h. Transaction handling — `sqlite.exec("BEGIN IMMEDIATE")` → `rawExecute`:**

Old:
```typescript
this.sqlite.exec("BEGIN IMMEDIATE");
try {
  // ... operations ...
  this.sqlite.exec("COMMIT");
} catch (error) {
  this.sqlite.exec("ROLLBACK");
  throw error;
}
```

New:
```typescript
await rawExecute("BEGIN IMMEDIATE");
try {
  // ... operations (all awaited) ...
  await rawExecute("COMMIT");
} catch (error) {
  await rawExecute("ROLLBACK");
  throw error;
}
```

**1i. Methods that were sync but use DB become async:**

These private methods need `async` added:
- `getMeta()` → `async getMeta()`
- `requireMeta()` → `async requireMeta()`
- `setMeta()` → `async setMeta()`
- `pendingCount()` → `async pendingCount()`
- `pendingEvents()` → `async pendingEvents()`
- `listTasks()` → `async listTasks()`
- `listDecisions()` → `async listDecisions()`
- `requireProject()` → `async requireProject()`
- `insertEventRow()` → `async insertEventRow()`
- `applyProjection()` → `async applyProjection()`
- `displayNameForEventActor()` → `async displayNameForEventActor()`
- `avatarForEventActor()` → `async avatarForEventActor()`
- `hydrateTimelineEvent()` → `async hydrateTimelineEvent()`

And all their call sites need `await`.

**1j. `postJson` — uses `fetch()` which already works in browser. No changes needed.**

**1k. Remove the `EventRow` type alias at the bottom — keep it, just ensure it's exported if needed.**

- [ ] **Step 2: Verify the adapted file compiles**

Run from project root:
```bash
cd apps/desktop && npx tsc --noEmit --pretty 2>&1 | head -40
```

Fix any type errors. Common issues:
- Missing `await` on newly-async methods
- Drizzle sqlite-proxy may return slightly different types for `.get()` (returns `T | undefined` as a Promise)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/core/repository.ts
git commit -m "feat: adapt repository.ts for WebView with async SQLite"
```

---

### Task 6: Adapt store.ts — direct repository calls instead of IPC

**Files:**
- Modify: `apps/desktop/src/renderer/store.ts` → move to `apps/desktop/src/store.ts`

- [ ] **Step 1: Copy store.ts and rewrite desktopApi calls to direct repository calls**

The store currently calls `window.desktopApi.xxx()` for everything. Replace with direct repository imports.

Key changes at the top of the file:

Old:
```typescript
// All calls go through window.desktopApi
const bootstrap = await window.desktopApi.bootstrap();
```

New:
```typescript
import { repository } from "./core/repository.js";
import { readClipboardImage, showNotification, getSystemIdleTime } from "./core/native.js";

// Direct calls
const bootstrap = await repository.bootstrap();
```

**Replace every `window.desktopApi.xxx(args)` with `repository.xxx(args)`** for these methods:
- `bootstrap()`, `completeSetup()`, `updateSettings()`, `clearConnection()`
- `listProjects()`, `createProject()`, `joinProject()`, `createInvite()`, `leaveProject()`
- `openWorkspace()`, `listMembers()`, `listChannels()`, `createChannel()`, `renameChannel()`, `deleteChannel()`
- `listTimeline()`, `postMessage()`, `editMessage()`, `deleteMessage()`
- `addReaction()`, `removeReaction()`, `recordDecision()`, `createTask()`, `setTaskStatus()`
- `listDocs()`, `createDoc()`, `renameDoc()`, `updateDoc()`, `listDocComments()`, `addDocComment()`
- `searchMessages()`, `getSyncStatus()`, `syncNow()`, `getPresence()`, `updatePresence()`

**Replace OS feature calls:**
- `window.desktopApi.readClipboardImage()` → `readClipboardImage()` (from native.ts)

**Replace event listeners with repository emitter subscriptions:**

Old:
```typescript
window.desktopApi.onSyncStatus((status) => { set({ syncStatus: status }); });
window.desktopApi.onWorkspaceChanged(async (projectId) => { ... });
window.desktopApi.onNotification(({ title, body, projectId, chatChannelId }) => { ... });
window.desktopApi.onPresenceChanged((presence) => { set({ presence }); });
window.desktopApi.onVersionOutdated((payload) => { set({ versionWarning: payload }); });
```

New:
```typescript
repository.onSyncStatus((status) => { set({ syncStatus: status }); });
repository.onWorkspaceChanged(async (projectId) => { ... });
repository.onNotification(async ({ title, body, projectId, chatChannelId }) => {
  // In-app toast (same as before)
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* audio not available */ }
  set({ inAppNotification: { title, body, projectId, chatChannelId, id: Date.now() } });
  setTimeout(() => {
    const current = get().inAppNotification;
    if (current !== null && current.id <= Date.now() - 5000) {
      set({ inAppNotification: null });
    }
  }, 6000);
  // OS notification via Tauri
  await showNotification(title, body);
});
repository.onPresenceChanged((presence) => { set({ presence }); });
repository.onVersionOutdated((latestVersion) => {
  set({ versionWarning: { latestVersion, currentVersion: __APP_VERSION__ } });
});
```

**Add idle detection polling in initialize():**

```typescript
// At the end of initialize(), after repository.init()
const IDLE_THRESHOLD_S = 5 * 60;
let currentPresence: "online" | "away" = "online";
setInterval(async () => {
  const idleSeconds = await getSystemIdleTime();
  const newPresence = idleSeconds >= IDLE_THRESHOLD_S ? "away" : "online";
  if (newPresence !== currentPresence) {
    currentPresence = newPresence;
    repository.updatePresence(newPresence);
  }
}, 30_000);
```

**Remove `onNavigateToChat` listener** — this was Electron-specific (OS notification click → BrowserWindow focus). In Tauri, in-app toast click already handles navigation via the store.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/store.ts
git commit -m "feat: rewire store.ts to call repository directly instead of IPC"
```

---

### Task 7: Move renderer files to new structure and update Vite config

**Files:**
- Move: `apps/desktop/src/renderer/App.tsx` → `apps/desktop/src/App.tsx`
- Move: `apps/desktop/src/renderer/styles.css` → `apps/desktop/src/styles.css`
- Move: `apps/desktop/src/renderer/main.tsx` → `apps/desktop/src/main.tsx`
- Move: `apps/desktop/src/renderer/index.html` → `apps/desktop/index.html`
- Modify: `apps/desktop/src/renderer/global.d.ts` → `apps/desktop/src/global.d.ts`
- Modify: `apps/desktop/vite.config.ts`
- Modify: `apps/desktop/tsconfig.json`

- [ ] **Step 1: Move files**

```bash
cd /home/andy/project/vibe/Slopify/apps/desktop
mv src/renderer/App.tsx src/App.tsx
mv src/renderer/styles.css src/styles.css
mv src/renderer/main.tsx src/main.tsx
mv src/renderer/index.html index.html
mv src/renderer/global.d.ts src/global.d.ts
```

- [ ] **Step 2: Update global.d.ts — remove DesktopApi, keep APP_VERSION**

```typescript
// apps/desktop/src/global.d.ts
declare const __APP_VERSION__: string;
```

- [ ] **Step 3: Update main.tsx imports**

```typescript
// apps/desktop/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles.css";

const rootNode = document.getElementById("root");
if (!rootNode) {
  throw new Error("Renderer root element not found");
}

createRoot(rootNode).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Update App.tsx import for store**

In `apps/desktop/src/App.tsx`, update the store import:

Old:
```typescript
import { getSelectedDoc, useAppStore } from "./store.js";
```

This stays the same since store.ts is now at the same level.

- [ ] **Step 5: Update App.tsx — replace readClipboardImage IPC call**

Find the clipboard image paste handler in App.tsx (in the chat composer `onKeyDown`/`onPaste` handler) and replace:

Old:
```typescript
const dataUrl = await window.desktopApi.readClipboardImage();
```

New:
```typescript
import { readClipboardImage } from "./core/native.js";
// ...
const dataUrl = await readClipboardImage();
```

- [ ] **Step 6: Update vite.config.ts for new structure**

```typescript
// apps/desktop/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gitHash = (() => {
  try { return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim(); }
  catch { return "unknown"; }
})();

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(gitHash),
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? { protocol: "ws", host, port: 5174 }
      : undefined,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

- [ ] **Step 7: Update tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/ apps/desktop/index.html apps/desktop/vite.config.ts apps/desktop/tsconfig.json
git commit -m "feat: restructure desktop app for Tauri (move renderer to src/)"
```

---

### Task 8: Remove Electron-specific files and dependencies

**Files:**
- Delete: `apps/desktop/src/main/` (entire directory)
- Delete: `apps/desktop/src/preload/` (entire directory)
- Delete: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json` (remove Electron deps)

- [ ] **Step 1: Delete Electron files**

```bash
cd /home/andy/project/vibe/Slopify/apps/desktop
rm -rf src/main/ src/preload/ src/renderer/ electron-builder.yml
```

- [ ] **Step 2: Remove Electron dependencies from package.json**

Remove from `dependencies`:
- `better-sqlite3`

Remove from `devDependencies`:
- `@types/better-sqlite3`
- `electron`
- `electron-builder`
- `concurrently`
- `wait-on`

Add to `dependencies` (if not already added in Task 1):
- `@tauri-apps/api`
- `@tauri-apps/plugin-sql`
- `@tauri-apps/plugin-notification`
- `@tauri-apps/plugin-clipboard-manager`
- `@tauri-apps/plugin-os`
- `@tauri-apps/plugin-shell`

Keep:
- `@slopify/shared`, `drizzle-orm`, `marked`, `socket.io-client`, `ulid`, `zod`
- `react`, `react-dom`, `zustand`, `tailwindcss`, `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite`, `typescript`
- `@types/react`, `@types/react-dom`

Remove `@types/node` from devDependencies (no longer needed — no Node.js in renderer).

- [ ] **Step 3: Remove Electron postinstall script**

In root `package.json`, remove:
```json
"postinstall": "npm run -w apps/desktop rebuild:native"
```

In `apps/desktop/package.json`, remove:
```json
"rebuild:native": "electron-builder install-app-deps",
"predev:electron": "npm run rebuild:native"
```

- [ ] **Step 4: Run npm install to clean up**

```bash
cd /home/andy/project/vibe/Slopify
npm install
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove Electron, update deps for Tauri"
```

---

### Task 9: Update root package.json scripts

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update root dev and build scripts**

Old:
```json
{
  "scripts": {
    "dev": "npm run build -w packages/shared && docker compose up -d --wait postgres && dotenv -- concurrently -k -n server,desktop -c cyan,green \"npm run dev:sync-server\" \"npm run dev:desktop\"",
    "dev:desktop": "npm run -w apps/desktop dev:desktop",
    "dist": "npm run build -w packages/shared && npm run dist -w apps/desktop",
    "dist:mac": "npm run build -w packages/shared && npm run dist:mac -w apps/desktop",
    "dist:win": "npm run build -w packages/shared && npm run dist:win -w apps/desktop",
    "dist:linux": "npm run build -w packages/shared && npm run dist:linux -w apps/desktop"
  }
}
```

New:
```json
{
  "scripts": {
    "dev": "npm run build -w packages/shared && docker compose up -d --wait postgres && dotenv -- concurrently -k -n server,desktop -c cyan,green \"npm run dev:sync-server\" \"npm run dev:desktop\"",
    "dev:desktop": "npm run -w apps/desktop dev",
    "dev:sync-server": "npm run -w apps/sync-server dev",
    "dist": "npm run build -w packages/shared && npm run dist -w apps/desktop",
    "dist:mac": "npm run build -w packages/shared && npm run dist:mac -w apps/desktop",
    "dist:win": "npm run build -w packages/shared && npm run dist:win -w apps/desktop",
    "dist:linux": "npm run build -w packages/shared && npm run dist:linux -w apps/desktop"
  }
}
```

Also remove the `postinstall` script:

```json
"postinstall": "npm run -w apps/desktop rebuild:native"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: update root scripts for Tauri"
```

---

### Task 10: Update CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update ci.yml — remove Electron-specific steps, add Rust toolchain**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Install system dependencies (Tauri)
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npx eslint .

      - name: Build shared
        run: npm run build -w packages/shared

      - name: Typecheck
        run: npx tsc -p apps/desktop/tsconfig.json --noEmit

      - name: Build sync-server
        run: npm run build -w apps/sync-server

      - name: Test
        run: npx vitest run --coverage

      - name: Audit
        run: npm audit --audit-level=high
        continue-on-error: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: update CI for Tauri (add Rust toolchain, system deps)"
```

---

### Task 11: Verify build and smoke test

**Files:** None — verification only

- [ ] **Step 1: Build shared package**

```bash
cd /home/andy/project/vibe/Slopify
npm run build -w packages/shared
```

Expected: Success, no errors.

- [ ] **Step 2: Typecheck desktop app**

```bash
npx tsc -p apps/desktop/tsconfig.json --noEmit
```

Expected: Success, no errors. Fix any type errors from the migration.

- [ ] **Step 3: Build Vite frontend**

```bash
cd apps/desktop && npm run build:vite
```

Expected: `dist/` directory created with bundled JS/CSS/HTML.

- [ ] **Step 4: Build Tauri Rust backend**

```bash
cd apps/desktop && cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: Compiles successfully. First build will take a few minutes to download and compile crates.

- [ ] **Step 5: Run dev mode**

```bash
cd apps/desktop && npm run dev
```

Expected: Tauri window opens with Slopify UI. Setup screen should appear. Verify:
- Setup form renders
- Can enter display name, server URL, password
- SQLite database created at app data dir

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from Tauri migration"
```

---

### Task 12: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md commands section**

Replace Electron-specific commands with Tauri equivalents:
- `npm run dev:desktop` now runs `tauri dev` instead of Electron concurrently
- `npm run dist:linux/mac/win` now runs `tauri build`
- Remove `rebuild:native` references
- Add note: Rust toolchain required (`rustup`)
- Add note: system deps required on Linux (`libwebkit2gtk-4.1-dev` etc.)

- [ ] **Step 2: Update AGENTS.md**

Update the technology stack table, repository structure, build commands, and architecture sections to reflect Tauri instead of Electron. Key changes:
- Desktop framework: Electron → Tauri v2
- Local DB: better-sqlite3 → tauri-plugin-sql (sqlx)
- No more main/renderer/preload split
- Add `src-tauri/` to file structure
- Update "Adding a new IPC method" section (no more IPC — direct calls)

- [ ] **Step 3: Update README.md prerequisites**

Add Rust toolchain to prerequisites. Update dev/build instructions.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md
git commit -m "docs: update documentation for Tauri migration"
```
