# Electron to Tauri v2 Migration Design

## Overview

Migrate Slopify's desktop app from Electron to Tauri v2 using the **WebView-concentrated** approach: move all business logic (repository, sync, event sourcing) into the WebView as regular TypeScript modules, use Tauri only for OS-level features.

## Goals

- Replace Electron with Tauri v2 for drastically smaller binaries (~150MB → ~10MB) and lower memory usage
- Preserve all existing functionality: offline-first sync, event sourcing, chat, docs, tasks, decisions, presence
- Minimize Rust code — only for OS features that require native access
- Reuse as much existing TypeScript as possible

## Non-Goals

- Rewriting business logic in Rust
- Mobile support (future consideration only)
- Changing the sync-server — it stays exactly as-is
- Changing the shared package schemas/types

---

## Architecture

### Current (Electron)

```
Electron main process (Node.js)
  ├── main.ts          (app lifecycle, window, notifications, idle detection)
  ├── db.ts            (SQLite bootstrap via better-sqlite3)
  ├── schema.ts        (Drizzle table definitions)
  ├── repository.ts    (all business logic, event sourcing, sync orchestration)
  ├── sync-client.ts   (Socket.IO client)
  └── ipc.ts           (IPC handler registration)
      ↕ Electron IPC (contextBridge)
Renderer (React + Zustand)
  ├── App.tsx
  ├── store.ts         (calls window.desktopApi.xxx())
  └── preload bridge   (window.desktopApi → ipcRenderer.invoke)
```

### Target (Tauri v2)

```
Tauri WebView
  ├── App.tsx           (minimal changes)
  ├── store.ts          (calls repository directly, no IPC)
  ├── repository.ts     (moved here, SQLite via tauri-plugin-sql + Drizzle sqlite-proxy)
  ├── sync-client.ts    (moved here, socket.io-client works natively in WebView)
  ├── db.ts             (new: sqlite-proxy adapter + migration runner)
  ├── schema.ts         (reused from current desktop, no changes)
  └── native.ts         (thin wrapper: invoke() calls to Rust for OS features)

Tauri Rust Core (src-tauri/)
  ├── main.rs           (app setup, plugin registration)
  ├── commands.rs       (clipboard image read, idle time check)
  └── Cargo.toml        (tauri + plugins: sql, notification, clipboard, os)
```

---

## Monorepo Structure Changes

```
Slopify/
  apps/
    desktop/                    ← Tauri app (replaces Electron app)
      src/                      ← Frontend source (was src/renderer/)
        App.tsx
        store.ts
        styles.css
        main.tsx
        global.d.ts
        core/                   ← Business logic (was src/main/)
          repository.ts         ← Adapted: sqlite-proxy instead of better-sqlite3
          sync-client.ts        ← Mostly unchanged
          db.ts                 ← New: tauri-plugin-sql + Drizzle sqlite-proxy adapter
          schema.ts             ← Unchanged Drizzle schema definitions
          native.ts             ← New: Tauri invoke() wrappers for OS features
      src-tauri/                ← New: Tauri Rust backend
        src/
          main.rs
          commands.rs
        Cargo.toml
        tauri.conf.json
        capabilities/
          default.json
        icons/
      index.html                ← Vite entry (moved from src/renderer/)
      vite.config.ts
      package.json
      tsconfig.json
    sync-server/                ← No changes
  packages/
    shared/                     ← No changes
```

### Files Deleted

- `apps/desktop/src/main/main.ts` — Electron app lifecycle → replaced by src-tauri/main.rs
- `apps/desktop/src/main/ipc.ts` — Electron IPC registration → no longer needed
- `apps/desktop/src/main/db.ts` — better-sqlite3 bootstrap → replaced by new db.ts
- `apps/desktop/src/preload/` — Electron preload scripts → not needed in Tauri
- `apps/desktop/electron-builder.yml` — replaced by tauri.conf.json

---

## Detailed Component Design

### 1. SQLite Layer: tauri-plugin-sql + Drizzle sqlite-proxy

The current codebase uses two patterns for SQLite:
- **Drizzle ORM** for simple CRUD (`db.select().from(users).where(...)`)
- **Raw SQL via `sqlite.prepare()`** for complex queries (listProjects, listTimeline, searchMessages)

Both will work through `tauri-plugin-sql`:

```typescript
// src/core/db.ts
import Database from '@tauri-apps/plugin-sql';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

let sqlite: Database;

export const initDb = async (dbPath: string): Promise<void> => {
  sqlite = await Database.load(`sqlite:${dbPath}`);
  // Run bootstrap SQL (same CREATE TABLE IF NOT EXISTS statements)
  await sqlite.execute(bootstrapSql);
};

// Drizzle adapter for ORM-style queries
export const db = drizzle(async (sql, params, method) => {
  if (method === 'all') {
    const rows = await sqlite.select(sql, params as unknown[]);
    return { rows };
  }
  await sqlite.execute(sql, params as unknown[]);
  return { rows: [] };
});

// Direct SQL access for complex queries (replaces sqlite.prepare().all())
export const rawQuery = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
  return await sqlite.select(sql, params ?? []) as T[];
};

export const rawExecute = async (sql: string, params?: unknown[]): Promise<void> => {
  await sqlite.execute(sql, params ?? []);
};
```

**Key change in repository.ts**: All synchronous `sqlite.prepare().all()` / `.run()` / `.get()` calls become `async` calls through the plugin. This means repository methods that were sync become async (most already are).

### 2. repository.ts Adaptation

The repository moves from `apps/desktop/src/main/` to `apps/desktop/src/core/`. Changes:

| Current (Electron) | Target (Tauri) |
|---|---|
| `this.sqlite.prepare(sql).all(params)` | `await rawQuery(sql, params)` |
| `this.sqlite.prepare(sql).run(params)` | `await rawExecute(sql, params)` |
| `this.db.select().from(table).where(...).get()` | `await db.select().from(table).where(...).get()` (already async-compatible via proxy) |
| `this.sqlite.exec("BEGIN IMMEDIATE")` | `await rawExecute("BEGIN IMMEDIATE")` |
| `new EventEmitter()` for notifications | Browser `EventTarget` or simple callback pattern |
| Constructor takes `(db, sqlite, appVersion)` | Constructor takes `(appVersion)`, uses module-level db |

The event sourcing logic (applyLocalEvent, applyRemoteEvents, syncNow) stays identical — only the DB access methods change.

### 3. sync-client.ts

Almost no changes. socket.io-client works in browser environments. The only difference:

| Current | Target |
|---|---|
| Runs in Node.js (Electron main process) | Runs in WebView (browser environment) |
| `import { io } from "socket.io-client"` | Same import — socket.io-client has browser builds |

The WebSocket transport works natively. No Rust involvement needed.

### 4. store.ts Changes

Currently, store.ts calls `window.desktopApi.xxx()` which goes through IPC to the main process. In Tauri, the repository is in the same JS context, so calls become direct:

```typescript
// Before (Electron)
const bootstrap = await window.desktopApi.bootstrap();

// After (Tauri)
import { repository } from './core/repository';
const bootstrap = await repository.bootstrap();
```

The `window.desktopApi` bridge and `DesktopApi` interface are no longer needed for repository calls. They may still be used as a thin wrapper around Tauri invoke() for OS features.

### 5. OS Features → Tauri Plugins + Rust Commands

| Feature | Current (Electron) | Target (Tauri) |
|---|---|---|
| **Notifications** | `new Notification({ title, body })` in main.ts | `@tauri-apps/plugin-notification` — call from JS |
| **Clipboard image** | `clipboard.readImage()` + WSL2 PowerShell fallback in ipc.ts | Custom Rust command using `arboard` crate or `@tauri-apps/plugin-clipboard-manager` |
| **Idle detection** | `powerMonitor.getSystemIdleTime()` polled every 30s in main.ts | Custom Rust command using platform APIs (see below) |
| **Window badge/flash** | `setOverlayIcon()`, `flashFrame()`, `setBadgeCount()` in main.ts | Tauri window API or custom Rust command |
| **Zoom controls** | `webContents.setZoomLevel()` in main.ts | `@tauri-apps/api/webview` or CSS transform |
| **App version** | `git rev-parse --short HEAD` in main.ts | Build-time env var via `tauri.conf.json` |
| **User data dir** | `app.getPath('userData')` | `@tauri-apps/api/path` — `appDataDir()` |

#### Rust Commands (src-tauri/src/commands.rs)

Only two custom commands needed:

```rust
#[tauri::command]
fn get_system_idle_time() -> u64 {
    // Platform-specific idle time detection
    // Linux: read /proc/idle or use X11/Wayland APIs
    // macOS: CGEventSourceSecondsSinceLastEventType
    // Windows: GetLastInputInfo
    0
}

#[tauri::command]
async fn read_clipboard_image() -> Option<String> {
    // Read image from clipboard, return as data URL
    // Uses arboard crate
    None
}
```

### 6. native.ts — Tauri OS Feature Wrapper

```typescript
// src/core/native.ts
import { invoke } from '@tauri-apps/api/core';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { appDataDir } from '@tauri-apps/api/path';

export const showNotification = (title: string, body: string): void => {
  sendNotification({ title: `Slopify — ${title}`, body });
};

export const getSystemIdleTime = async (): Promise<number> => {
  return await invoke<number>('get_system_idle_time');
};

export const readClipboardImage = async (): Promise<string | null> => {
  return await invoke<string | null>('read_clipboard_image');
};

export const getAppDataDir = async (): Promise<string> => {
  return await appDataDir();
};
```

### 7. App Initialization Flow

Currently in `main.ts` (Electron):
1. `app.whenReady()`
2. Create SQLite DB
3. Create DesktopRepository
4. Register IPC handlers
5. Create BrowserWindow
6. Start idle detection polling

In Tauri, initialization splits between Rust (app setup) and JS (business logic):

**Rust (main.rs)**:
1. Register plugins (sql, notification, clipboard, os)
2. Register custom commands
3. Create webview window

**JS (main.tsx or store.ts initialize)**:
1. `initDb(await getAppDataDir())` — initialize SQLite through plugin
2. Create repository instance
3. `repository.init()` — connect sync, start polling
4. Start idle detection polling (calls `getSystemIdleTime()` every 30s)

### 8. Tauri Configuration

**tauri.conf.json** (key settings):
```json
{
  "productName": "Slopify",
  "identifier": "com.slopify.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev:vite",
    "beforeBuildCommand": "npm run build:vite"
  },
  "app": {
    "windows": [{
      "title": "Slopify",
      "width": 1280,
      "height": 860,
      "minWidth": 960,
      "minHeight": 640
    }]
  },
  "plugins": {
    "sql": { "preload": ["sqlite:slopify.sqlite"] },
    "notification": {}
  }
}
```

**Capabilities (capabilities/default.json)**:
```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "notification:default",
    "clipboard-manager:default",
    "os:default",
    "shell:default"
  ]
}
```

### 9. Build & Distribution

| | Electron | Tauri |
|---|---|---|
| Build tool | electron-builder | tauri-cli (`cargo tauri build`) |
| macOS | .dmg | .dmg, .app |
| Windows | .exe (NSIS) | .exe (NSIS), .msi |
| Linux | .AppImage | .AppImage, .deb |
| Dev command | `concurrently tsc vite electron` | `cargo tauri dev` (runs Vite + Rust) |

### 10. E2E Tests

E2E tests currently use `@playwright/test` with Electron-specific fixtures (`_electron.launch()`). Tauri has `@tauri-apps/driver` but it's less mature. Options:

- **Short term**: Adapt tests to use Tauri's WebDriver support or `tauri-driver`
- **Practical**: Most E2E tests use `window.desktopApi` which will still exist as a compatibility shim. The runtime tests may work with minimal changes.

The UI tests that click through the app will need the Electron launch fixture replaced with a Tauri launch fixture.

---

## Migration Order

1. Scaffold Tauri project alongside existing Electron code
2. Create `src/core/db.ts` with tauri-plugin-sql adapter
3. Move and adapt `repository.ts` to use async DB calls
4. Move `sync-client.ts` (minimal changes)
5. Create `native.ts` for OS feature wrappers
6. Write Rust commands (idle time, clipboard image)
7. Adapt `store.ts` to call repository directly instead of via IPC
8. Move renderer files to new structure
9. Adapt `App.tsx` for notification/clipboard changes
10. Configure tauri.conf.json, capabilities, icons
11. Delete Electron-specific files
12. Update build scripts and CI
13. Adapt E2E tests
14. Update AGENTS.md and documentation

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| tauri-plugin-sql doesn't support all SQLite features used | Low | Plugin uses sqlx which supports full SQLite. Raw SQL passthrough available. |
| socket.io-client WebSocket issues in Tauri WebView | Low | Standard browser WebSocket. Tested in community projects. |
| Sync-in-progress data loss on WebView reload | Low | Events have sync_status in SQLite. Re-sync on next startup. Dev-only concern. |
| Platform-specific idle detection in Rust | Medium | Can use existing crates (user-idle, x11/wayland). Fallback: disable feature gracefully. |
| Clipboard image reading across platforms | Medium | arboard crate handles this. WSL2 fallback no longer needed (Tauri runs native). |
| E2E test adaptation | Medium | May need significant fixture changes. Can defer and test manually initially. |
