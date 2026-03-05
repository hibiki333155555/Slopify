# Deployment Guide

Deploy the Slopify sync server on any Linux server with Docker.

## What the server does

The sync server is a real-time relay between desktop clients. It receives events (messages, decisions, etc.) from each client via Socket.IO, stores them in PostgreSQL, and broadcasts them to other connected clients. Offline clients pull missed events when they reconnect.

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended)
- Docker and Docker Compose

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in
```

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/hibiki333155555/Slopify.git
cd Slopify
cp .env.example .env
```

Edit `.env`:

```
PORT=4000
SERVER_ACCESS_PASSWORD=your-secret-password
POSTGRES_DB=slopify
POSTGRES_USER=slopify
POSTGRES_PASSWORD=a-strong-db-password
```

### 2. Start

```bash
docker compose up -d --build
```

### 3. Verify

```bash
docker compose ps
curl http://localhost:4000/health
# {"ok":true}
```

## Share with users

Give your users:
- **Server URL**: `http://YOUR_SERVER_IP:4000`
- **Server access password**: the value from `.env`

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 4000/tcp
sudo ufw enable
```

PostgreSQL is internal only (not exposed to the internet).

## Management

```bash
docker compose logs -f sync-server   # View logs
docker compose restart               # Restart
docker compose down                  # Stop

# Update
git pull
docker compose up -d --build
```

## Backups

PostgreSQL data is in Docker volume `postgres_data`. Schedule `pg_dump` backups as needed.

## HTTPS

For production, put a reverse proxy (nginx or Caddy) in front of port 4000 with TLS.
