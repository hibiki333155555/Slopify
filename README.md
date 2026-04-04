# Slopify

make AI Slop a lot.

Local-first, event-sourced collaborative workspace. Tauri v2 desktop client with SQLite syncs via Socket.IO to a Fastify/PostgreSQL server. Works fully offline.

## Prerequisites

- Node.js 20+
- Rust toolchain (install via [rustup](https://rustup.rs/))
- Docker (for PostgreSQL and sync-server)

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

## Deploy sync server (VPS)

The sync server is a real-time relay. It receives events from each desktop client via Socket.IO, stores them in PostgreSQL, and broadcasts to other connected clients.

```bash
# On your VPS (Ubuntu + Docker)
git clone https://github.com/hibiki333155555/Slopify.git
cd Slopify
cp .env.example .env   # Edit passwords
docker compose up -d --build
```

Give users the server URL (`http://YOUR_VPS_IP:4000`) and password. See `docs/deployment-guide.md` for details.

## Stack

- Tauri v2 + React + Zustand (desktop)
- Fastify + Socket.IO + PostgreSQL (server)
- SQLite + Drizzle ORM via tauri-plugin-sql (local storage)
- TypeScript, Zod, ULID
