# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slopify is a local-first, event-sourced collaborative workspace. Electron desktop client with SQLite local storage syncs via Socket.IO to a Fastify server backed by PostgreSQL. Works fully offline; events sync when reconnected.

## Commands

```bash
# Install dependencies (npm workspaces)
npm install

# Build all packages (shared must build before apps)
npm run build

# Start everything (postgres + sync-server + desktop)
npm run dev

# Dev mode (individual)
npm run dev:desktop       # Runs renderer (Vite), main (tsc --watch), and Electron concurrently
npm run dev:sync-server   # Runs server via tsx
docker compose up -d postgres

# Build individual packages
npm run build -w packages/shared
npm run build -w apps/desktop
npm run build -w apps/sync-server

# Distribution builds
npm run dist:linux
npm run dist:mac
npm run dist:win

# Docker (server + postgres)
docker compose up --build

# E2E tests (requires dev environment running)
npm run test:e2e              # Run all E2E tests
npm run test:e2e:ui           # UI-based E2E (Playwright clicks)
npm run test:e2e:runtime      # API-based E2E (desktopApi calls)

# Type-check E2E tests
npx tsc -p e2e/tsconfig.json --noEmit
```

E2E tests live in `e2e/` and use `@playwright/test` with Electron. They run serially (`workers: 1`) with a 3-minute timeout. Set `SLOPIFY_SERVER_URL`, `SLOPIFY_SERVER_PASSWORD`, and `SLOPIFY_RENDERER_URL` env vars to override defaults.

## Architecture

**Monorepo layout:** `apps/desktop`, `apps/sync-server`, `packages/shared`

**Event-sourced sync model:**
- All mutations produce events (e.g. `project.created`, `message.posted`, `task.completed`)
- Desktop stores events in SQLite; server stores in PostgreSQL
- Sync uses Socket.IO: client pulls events since last sync, pushes pending events, server broadcasts to other clients
- Pull cursor uses `server_seq` (server-side auto-increment), NOT client `created_at` timestamps — this prevents missed events when clients push stale offline data
- DB schema auto-migrates on server startup (`db.ts` bootstrapSql adds `server_seq` column to existing tables)

**Desktop app (Electron + React):**
- Main process: `apps/desktop/src/main/` — `repository.ts` is the data access layer over SQLite/Drizzle, `ipc.ts` registers all IPC handlers, `sync-client.ts` manages Socket.IO connection
- Renderer: `apps/desktop/src/renderer/` — React with Zustand store (`store.ts`), single `App.tsx` routes between screens (Setup, Projects, Workspace, Settings)
- Preload exposes `window.desktopApi` typed via `packages/shared/src/types/index.ts`
- Chat messages render markdown via `marked` library with `.prose-chat` styles
- Chat composer: Enter to send, Shift+Enter for newline, Ctrl+V to paste images
- Decisions panel is resizable (drag divider) and collapsible (toggle in chat header)

**Sync server (Fastify + Socket.IO) — deployed on VPS:**
- Real-time relay: receives events from desktop clients via Socket.IO, stores in PostgreSQL, broadcasts to other connected clients. Offline clients pull missed events on reconnect.
- `apps/sync-server/src/index.ts` — server setup, Socket.IO event handlers, Fastify routes
- `apps/sync-server/src/repository.ts` — PostgreSQL data access
- `apps/sync-server/src/db.ts` — PostgreSQL schema bootstrap with auto-migration (adds `server_seq` to existing DBs)
- Socket.IO `maxHttpBufferSize` and Fastify `bodyLimit` set to 50 MB for base64 image payloads
- Auth is a single shared password (`SERVER_ACCESS_PASSWORD` env var)
- Deployed via `docker compose up -d --build` on any Linux server with Docker (see `docs/deployment-guide.md`)

**Shared package:**
- `packages/shared/src/schema/` — Zod schemas for all entities and commands
- `packages/shared/src/types/` — `DesktopApi` interface defining the IPC contract

## Key Conventions

- All code is TypeScript (ES modules). Zod for validation, ULID for IDs.
- SQLite tables defined with Drizzle ORM in `apps/desktop/src/main/schema.ts`
- The canonical requirements doc is `docs/docsv2.md`
- Workspace UI is a 2-pane layout: left sidebar (channels/docs/members), right content (chat with decisions panel, or doc editor with comments)
- Event types are defined in the shared schema and must stay consistent between client and server
- Tailwind CSS v4 with dark zinc theme
