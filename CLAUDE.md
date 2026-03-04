# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slopify is a local-first, event-sourced collaborative workspace. Electron desktop client with SQLite local storage syncs via Socket.IO to a Fastify server backed by PostgreSQL. Works fully offline; events sync when reconnected.

## Commands

```bash
# Install dependencies (npm workspaces)
npm install

# Build all packages (shared must build before apps)
npm run -ws build

# Dev mode
npm run dev:desktop       # Runs renderer (Vite), main (tsc --watch), and Electron concurrently
npm run dev:sync-server   # Runs server via tsx

# Build individual packages
npm run build -w packages/shared
npm run build -w apps/desktop
npm run build -w apps/sync-server

# Docker (server + postgres)
docker compose up --build
```

No test runner configured. E2E validation scripts exist at root: `slopify_e2e.mjs` and `slopify_runtime_v2.mjs` (run with `node`).

## Architecture

**Monorepo layout:** `apps/desktop`, `apps/sync-server`, `packages/shared`

**Event-sourced sync model:**
- All mutations produce events (e.g. `project.created`, `message.posted`, `task.completed`)
- Desktop stores events in SQLite; server stores in PostgreSQL
- Sync uses Socket.IO: client pulls events since last sync, pushes pending events, server broadcasts to other clients

**Desktop app (Electron + React):**
- Main process: `apps/desktop/src/main/` — `repository.ts` is the data access layer over SQLite/Drizzle, `ipc.ts` registers all IPC handlers, `sync-client.ts` manages Socket.IO connection
- Renderer: `apps/desktop/src/renderer/` — React with Zustand store (`store.ts`), single `App.tsx` routes between screens (Setup, Projects, Workspace, Settings)
- Preload exposes `window.desktopApi` typed via `packages/shared/src/types/index.ts`

**Sync server (Fastify + Socket.IO):**
- `apps/sync-server/src/index.ts` — server setup, Socket.IO event handlers, Fastify routes
- `apps/sync-server/src/repository.ts` — PostgreSQL data access
- Auth is a single shared password (`SERVER_ACCESS_PASSWORD` env var)

**Shared package:**
- `packages/shared/src/schema/` — Zod schemas for all entities and commands
- `packages/shared/src/types/` — `DesktopApi` interface defining the IPC contract

## Key Conventions

- All code is TypeScript (ES modules). Zod for validation, ULID for IDs.
- SQLite tables defined with Drizzle ORM in `apps/desktop/src/main/schema.ts`
- The canonical requirements doc is `docs/docsv2.md`
- Workspace UI is a 2-pane layout: left pane (channels/docs/members), right pane (chat or doc editor)
- Event types are defined in the shared schema and must stay consistent between client and server
