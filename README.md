# Slopify

make AI Slop a lot.

Local-first, event-sourced collaborative workspace. Electron desktop client with SQLite syncs via Socket.IO to a Fastify/PostgreSQL server. Works fully offline.

## Setup

```bash
# Install dependencies
npm install

# Copy env file and edit as needed
cp .env.example .env
```

## Development

```bash
# Start everything (postgres + sync-server + desktop)
npm run dev

# Or run individually
npm run dev:desktop
npm run dev:sync-server
docker compose up -d postgres
```

## Build

```bash
# Build all packages
npm run build

# Distribution builds
npm run dist:linux
npm run dist:mac
npm run dist:win
```

## E2E Tests

Requires dev environment running.

```bash
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:runtime
```

## Stack

- Electron + React + Zustand (desktop)
- Fastify + Socket.IO + PostgreSQL (server)
- SQLite + Drizzle ORM (local storage)
- TypeScript, Zod, ULID
