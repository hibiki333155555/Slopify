# DigitalOcean Operator Deployment Guide

## Prerequisites
- Ubuntu droplet with Docker Engine + Docker Compose plugin
- DNS record pointing to droplet (optional but recommended)
- `.env` created from `.env.example`

## 1. Prepare environment
1. Copy `.env.example` to `.env`.
2. Set strong values:
- `SERVER_ACCESS_PASSWORD`
- `POSTGRES_PASSWORD`

## 2. Start services
```bash
docker compose up -d --build
```

## 3. Verify
```bash
docker compose ps
curl http://127.0.0.1:4000/health
```
Expected response:
```json
{"ok":true}
```

## 4. Firewall
- Allow inbound TCP `4000` from trusted client networks.
- Keep `5432` private (do not expose publicly unless required).

## 5. Backups
- Postgres data is in Docker volume `postgres_data`.
- Schedule regular `pg_dump` backups to object storage.

## 6. Upgrade
```bash
docker compose pull
docker compose up -d --build
```

## 7. Runtime configuration contract
Desktop clients must use:
- `Server URL`: your public sync endpoint
- `Server access password`: `SERVER_ACCESS_PASSWORD`
