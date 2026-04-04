# AGENTS.md

Instructions for AI coding agents working on this repository.

---

## Product Overview

Slopify is a **local-first, event-sourced collaborative workspace**. A Tauri v2 desktop client stores data in SQLite and syncs via Socket.IO to a Fastify server backed by PostgreSQL. The app works fully offline; events reconcile when reconnected.

**Core features:** Projects, chat channels (with messages, decisions, tasks, reactions, replies), Markdown docs (with comments), invite-based collaboration, real-time presence, and full-text message search.

---

## Repository Structure

```
Slopify/
  apps/
    desktop/           # Tauri v2 + React desktop app
      src/
        core/          # Business logic (runs in WebView)
          db.ts        # SQLite bootstrap (tauri-plugin-sql + Drizzle ORM sqlite-proxy)
          schema.ts    # Drizzle table definitions (11 tables)
          repository.ts # Data access layer, sync orchestration, all business logic
          sync-client.ts # Socket.IO client: pull/push/presence/version check
          native.ts    # OS feature wrappers (notifications, idle detection, etc.)
        App.tsx        # All screens + components in one file (~1400 lines)
        store.ts       # Zustand store: all state + actions (calls repository directly)
        styles.css     # Tailwind v4 + prose-chat markdown styles
        main.tsx       # React entry
      src-tauri/       # Rust backend (Tauri commands, plugins, capabilities)
        src/
          main.rs      # Tauri app entry
        Cargo.toml     # Rust dependencies
        tauri.conf.json # Tauri configuration
        capabilities/  # Permission capabilities
    sync-server/       # Fastify + Socket.IO sync relay
      src/
        index.ts       # Server setup, Socket.IO handlers, Fastify routes
        db.ts          # PostgreSQL bootstrap with auto-migration
        repository.ts  # Server-side data access (push/pull events, projections)
      Dockerfile
  packages/
    shared/            # Shared types and validation
      src/
        schema/
          common.ts    # Base Zod schemas (ULID, timestamps, etc.)
          entities.ts  # Entity schemas (Project, Member, Channel, Doc, Task, Decision, etc.)
          events.ts    # 18 event types with typed payloads
          commands.ts  # Command schemas for all user actions
        types/
          index.ts     # DesktopApi interface, SyncStatus, SearchResult, etc.
  e2e/                 # Playwright E2E tests (UI + API/runtime)
  docs/
    docsv2.md          # Canonical requirements document
  docker-compose.yml   # PostgreSQL + sync-server
  .github/workflows/
    ci.yml             # Lint, typecheck, test, audit
    deploy.yml         # Auto-deploy sync-server to VPS on push to main
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri v2 |
| Renderer | React 18, Zustand 4, Tailwind CSS v4, Vite 5 |
| Local DB | SQLite via tauri-plugin-sql + Drizzle ORM (sqlite-proxy) |
| Markdown | `marked` library |
| Sync transport | Socket.IO (client + server) |
| Server framework | Fastify 5 |
| Server DB | PostgreSQL 16 via `pg` |
| Validation | Zod (all boundaries) |
| IDs | ULID |
| Language | TypeScript (ESM throughout) |
| Build | npm workspaces, tsc, Vite, Tauri (Cargo) |
| Testing | Vitest (unit), Playwright (E2E) |
| CI/CD | GitHub Actions |

---

## Build & Run Commands

```bash
npm install                    # Install all workspaces
npm run build                  # Build shared → sync-server → desktop
npm run dev                    # Full dev (postgres + server + desktop)
npm run dev:desktop            # Desktop only (Tauri dev mode: Vite + Rust backend)
npm run dev:sync-server        # Server only (tsx)
docker compose up -d postgres  # PostgreSQL only

# Distribution
npm run dist:linux / dist:mac / dist:win

# Testing
npm run test                   # Vitest unit tests
npm run test:e2e               # Playwright E2E (requires dev env running)
npm run test:e2e:ui            # UI-driven E2E tests
npm run test:e2e:runtime       # API-driven E2E tests
npx tsc -p e2e/tsconfig.json --noEmit  # Type-check E2E tests

# Linting
npm run lint                   # ESLint
```

**Build order matters:** `packages/shared` must build before `apps/desktop` and `apps/sync-server`.

---

## Architecture Deep Dive

### Event-Sourced Sync Model

All mutations produce events (not direct DB writes). The event flow:

1. **User action** → Zustand store → `repository.xxx()` (direct call in WebView)
2. **Repository** → `repository.ts` creates event(s), appends to local SQLite with `sync_status = 'pending'`
3. **Local projection** → `applyLocalEvent()` updates denormalized tables (projects, channels, tasks, etc.)
4. **Sync push** → `syncNow()` pushes pending events to server via Socket.IO `sync:push`
5. **Server** → validates, inserts with auto-increment `server_seq`, applies projection, broadcasts `sync:event` + `sync:events` to project room
6. **Other clients** → receive events, apply via `applyRemoteEvents()`, update local projections
7. **Pull on reconnect** → clients pull missed events using `server_seq` cursor (NOT timestamps)

### 18 Event Types

```
project.created, member.joined,
chat.created, chat.renamed, chat.deleted,
message.posted, message.edited, message.deleted,
message.reaction.added, message.reaction.removed,
decision.recorded,
task.created, task.completed, task.reopened,
doc.created, doc.renamed, doc.updated, doc.comment.added
```

### Sync Protocol Details

- **Pull cursor**: `server_seq` (server-side BIGSERIAL), stored in client's `app_meta` as `last_pulled_at`
- **Push**: client sends pending events, server returns `acceptedIds`, client marks as synced
- **Broadcast**: server emits `sync:event` (hint) + `sync:events` (full payload) to Socket.IO project rooms
- **Conflict handling**: idempotent inserts (`ON CONFLICT DO NOTHING` by event ID)
- **Max payload**: 50 MB (for base64 image payloads)

### Desktop App Screens

| Screen | Route | Description |
|---|---|---|
| Loading | `screen === "loading"` | Initial bootstrap |
| Setup | `screen === "setup"` | First-run: display name, avatar, server URL, password |
| Projects | `screen === "projects"` | Project list with create/join, sync status, presence |
| Workspace | `screen === "workspace"` | 2-pane: sidebar (channels, docs, members) + content |
| Settings | `screen === "settings"` | Profile + connection management |

### Workspace Layout

- **Left sidebar (256px)**: Search (Ctrl+K), Chats list, Docs list, Members with presence dots
- **Right content**: Chat view (messages + decisions panel, resizable divider) OR Doc view (markdown editor + comments)
- **Chat composer**: Enter to send, Shift+Enter for newline, Ctrl+V to paste images, reply-to support, emoji reactions, edit/delete messages
- **Decisions panel**: Resizable (drag divider), collapsible toggle in chat header

### Auth Model

- Single shared password per server (`SERVER_ACCESS_PASSWORD`)
- Client sends password on Socket.IO handshake and all HTTP requests
- Server validates before allowing any operation
- No user accounts — identity is a locally-generated ULID + display name

---

## Key Files & What They Do

### `apps/desktop/src/core/repository.ts` (largest file, ~950 lines)
The heart of the desktop app. Contains:
- `DesktopRepository` class with all business logic
- `bootstrap()`, `completeSetup()`, `updateSettings()` — identity management
- `createProject()`, `joinProject()`, `leaveProject()` — project lifecycle
- `postMessage()`, `editMessage()`, `deleteMessage()` — chat operations
- `addReaction()`, `removeReaction()` — emoji reactions
- `recordDecision()`, `createTask()`, `setTaskStatus()` — structured posts
- `createDoc()`, `updateDoc()`, `addDocComment()` — document operations
- `searchMessages()` — full-text search via SQLite LIKE
- `syncNow()` — orchestrates pull/push cycle
- `applyRemoteEvents()`, `applyLocalEvent()` — event projection to denormalized tables
- `appendLocalEvents()` — writes events to SQLite with `sync_status = 'pending'`

### `apps/desktop/src/App.tsx` (~1400 lines, single file)
All UI components in one file:
- `SetupScreen`, `ProjectsScreen`, `WorkspaceScreen`, `SettingsScreen`
- `SearchPanel` — Ctrl+K search overlay
- Inline chat message rendering with markdown, reactions, replies, edit/delete
- Doc editor with markdown preview and comments
- All helper components: `Avatar`, `AvatarPicker`, formatting utilities

### `apps/desktop/src/store.ts`
Zustand store with all app state and actions. Every user action flows through here. Calls repository methods directly (no IPC layer).

### `packages/shared/src/schema/events.ts`
All 18 event types with Zod-validated payloads. The source of truth for the event model.

---

## Database Schemas

### SQLite (Desktop) — 11 tables
`app_meta`, `users`, `projects`, `project_members`, `chat_channels`, `docs`, `doc_comments`, `tasks`, `decisions`, `events` (with `sync_status`), `invites`, `project_read_cursors`

### PostgreSQL (Server) — 10 tables
Same entities minus `app_meta`, `invites` (different schema: has `invite_code` PK), `project_read_cursors`. Events table has `server_seq BIGSERIAL` for cursor-based pull.

Both DBs auto-migrate on startup via `bootstrapSql` in their respective `db.ts` files.

---

## Testing Strategy

- **Unit tests**: Vitest with coverage (`vitest.config.ts` at root). Server repository has `repository.test.ts`.
- **E2E tests**: Playwright with Tauri. Two projects:
  - `ui` — UI-driven (Playwright clicks/types)
  - `runtime` — API-driven (calls `window.desktopApi` directly)
- E2E tests run serially (`workers: 1`) with 3-min timeout
- E2E env vars: `SLOPIFY_SERVER_URL`, `SLOPIFY_SERVER_PASSWORD`, `SLOPIFY_RENDERER_URL`

---

## Deployment

### Sync Server (VPS)
- `docker compose up -d --build` deploys PostgreSQL + sync-server
- CD pipeline (`.github/workflows/deploy.yml`) auto-deploys on push to `main` when server/shared files change
- PostgreSQL is only exposed on `127.0.0.1:5432` (not public)
- Env vars via `.env` (see `.env.example`)

### Desktop App
- Built via Tauri bundler: `.dmg` (macOS), `.msi`/`.exe` (Windows), `.deb`/`.AppImage` (Linux)
- `npm run dist:linux / dist:mac / dist:win`
- Requires Rust toolchain installed

---

## Coding Conventions

- All code is TypeScript with ES modules (`.js` extension in imports)
- Zod for all external boundary validation
- ULID for all entity IDs (generated with `ulid()`)
- Drizzle ORM (sqlite-proxy) for SQLite queries (desktop), raw SQL via `pg` for PostgreSQL (server)
- Tailwind CSS v4 with dark zinc theme
- No React Router — screen routing via Zustand `screen` state
- Single-file UI pattern: all components in `App.tsx`
- `marked` for Markdown rendering with `.prose-chat` CSS class

---

## Important Patterns to Preserve

1. **Event sourcing**: All mutations MUST produce events. Never write directly to projection tables.
2. **Local-first**: The app must work offline. All data reads come from local SQLite.
3. **Sync correctness**: Pull uses `server_seq`, not timestamps. Don't change this.
4. **Idempotent events**: Events use ULID as PK with `ON CONFLICT DO NOTHING`.
5. **Shared package builds first**: Always build `packages/shared` before apps.
6. **Repository as API surface**: `repository.ts` methods are the single source of truth for data operations, called directly from store.ts.
7. **Validation at boundaries**: Zod schemas validate all inputs in repository methods.
8. **No raw IDs in UI**: Timeline events get human-readable `timelineText`. System events show "Alice joined the project", not `member.joined`.

---

## Common Tasks

### Adding a new event type
1. Add to `eventTypeSchema` enum in `packages/shared/src/schema/events.ts`
2. Define payload schema and add to `eventPayloadSchema` discriminated union
3. Add projection logic in `apps/desktop/src/core/repository.ts` (`applyLocalEvent`)
4. Add projection logic in `apps/sync-server/src/repository.ts` (`applyProjection`)
5. Add timeline text generation in desktop repository's `hydrateTimelineEvent`
6. If new entity: add table to both `db.ts` files and `schema.ts`

### Adding a new repository method
1. Implement in `apps/desktop/src/core/repository.ts`
2. Call from store action in `apps/desktop/src/store.ts`

### Adding a new UI feature
1. Add store state/action in `store.ts`
2. Add component in `App.tsx` (or extract if significantly large)
3. Wire to repository calls via store actions

---

## Canonical Requirements

The requirements doc is `docs/docsv2.md`. When in doubt about product behavior, this document takes priority.

## Do Not

- Break offline functionality
- Change the sync cursor from `server_seq` to timestamps
- Expose raw ULIDs or event type strings in the UI
- Skip Zod validation at IPC/API boundaries
- Add heavy dependencies without justification
- Modify the event schema in backwards-incompatible ways (existing events in SQLite/PostgreSQL must remain valid)
