# Architecture

## Overview

Slopify is a local-first collaborative workspace. All data lives on each user's machine in SQLite. A sync server on a VPS relays events between clients in real-time.

```
Desktop (User A)                    VPS                         Desktop (User B)
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│  React UI    │              │  sync-server │              │  React UI    │
│  Zustand     │              │  (Fastify)   │              │  Zustand     │
│  ──────────  │  Socket.IO   │  ──────────  │  Socket.IO   │  ──────────  │
│  repository  │◄────────────►│  Socket.IO   │◄────────────►│  repository  │
│  SQLite      │              │  PostgreSQL  │              │  SQLite      │
└──────────────┘              └──────────────┘              └──────────────┘
```

## Data flow

### 1. User sends a message (example)

```
User A types "hello" and presses Enter
  → React calls store.postMessage("hello")
  → store calls window.desktopApi.postMessage(...)
  → IPC to main process → repository.postMessage()
  → repository creates a message.posted event
  → Event is saved to local SQLite (immediately visible in UI)
  → sync-client pushes the event to VPS via Socket.IO (sync:push)
```

### 2. VPS receives and broadcasts

```
sync-server receives sync:push
  → Validates event with Zod schema
  → Saves to PostgreSQL (repository.pushEvents)
  → Returns acceptedIds to sender
  → Broadcasts sync:events to all other clients in the same project room
```

### 3. Other clients receive

```
User B's sync-client receives sync:events
  → Events are saved to local SQLite
  → UI refreshes from local DB
  → "hello" appears in User B's chat
```

### 4. Offline → reconnect

```
User C is offline, writes messages locally
  → Events saved to SQLite with synced=false
  → When connection restores:
    → sync-client calls sync:pull (give me events since timestamp X)
    → sync-client calls sync:push (here are my pending events)
    → Both sides are now up to date
```

## What runs where

### Desktop (each user's PC)

- Electron app with React renderer
- SQLite database (all data stored locally)
- All business logic (message parsing, task management, doc editing)
- sync-client maintains Socket.IO connection to VPS

Key files:
- `apps/desktop/src/main/repository.ts` — data access layer over SQLite
- `apps/desktop/src/main/ipc.ts` — IPC handlers between main and renderer
- `apps/desktop/src/main/sync-client.ts` — Socket.IO client for sync
- `apps/desktop/src/renderer/App.tsx` — React UI
- `apps/desktop/src/renderer/store.ts` — Zustand state management

### VPS (sync server + database)

- Fastify HTTP server + Socket.IO
- PostgreSQL database (central event store)
- No business logic — just stores and forwards events

Key files:
- `apps/sync-server/src/index.ts` — entire server (~180 lines)
- `apps/sync-server/src/repository.ts` — PostgreSQL queries

### Shared package

- Zod schemas for events, commands, entities
- TypeScript types for the IPC contract (`DesktopApi`)

Key files:
- `packages/shared/src/schema/events.ts` — event type definitions
- `packages/shared/src/schema/commands.ts` — command schemas
- `packages/shared/src/types/index.ts` — DesktopApi interface

## Event-sourced model

All mutations produce events. There are no direct row updates.

```
project.created    — new project
member.joined      — user joined a project
chat.created       — new chat channel
message.posted     — chat message (with optional image)
decision.recorded  — decision logged in a channel
task.created       — new task
task.completed     — task checked off
task.reopened      — task unchecked
doc.created        — new document
doc.updated        — document content changed
doc.comment.added  — comment on a document
```

Each event has: `id`, `projectId`, `actorUserId`, `type`, `payload`, `createdAt`.

Events are immutable. The current state is derived by replaying events.

## Sync protocol

The sync server uses Socket.IO with two operations:

- **`sync:pull`** — client sends `{ projectIds, since }`, server returns events newer than `since`
- **`sync:push`** — client sends `{ events }`, server stores them and broadcasts to other clients

Authentication is a shared password sent with every request. All clients in the same project join a Socket.IO room (`project:{id}`) for targeted broadcasts.

## API endpoints (REST)

| Endpoint | Purpose |
|---|---|
| `GET /health` | Health check |
| `POST /auth/check` | Verify password |
| `POST /invites/create` | Generate invite code for a project |
| `POST /invites/join` | Join a project with invite code |
