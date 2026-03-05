# Slopify Server - Deployment Guide

Deploy the Slopify sync server on a DigitalOcean Ubuntu droplet (or any Linux server with Docker).

## Prerequisites

- Ubuntu 22.04+ server (DigitalOcean droplet recommended)
- Docker and Docker Compose installed
- A port open for the sync server (default: 4000)

### Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/hibiki333155555/Slopify.git
cd Slopify
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```
PORT=4000
SERVER_ACCESS_PASSWORD=your-secret-password

POSTGRES_DB=slopify
POSTGRES_USER=slopify
POSTGRES_PASSWORD=a-strong-db-password
```

**Important**: Change `SERVER_ACCESS_PASSWORD` to a unique password. Share this password privately with your users.

### 3. Start the server

```bash
docker compose up -d --build
```

This starts:
- **PostgreSQL** database (internal only, not exposed to the internet)
- **Sync server** on the configured port

### 4. Verify

```bash
docker compose ps
```

Both services should show `running`. Test the server:

```bash
curl http://localhost:4000/health
```

## Share with Users

Give your users:

1. **Server URL**: `http://YOUR_SERVER_IP:4000`
2. **Server access password**: the value you set in `.env`

They enter these on first launch of the Slopify desktop app.

## Management

```bash
# View logs
docker compose logs -f sync-server

# Restart
docker compose restart

# Stop
docker compose down

# Update to latest version
git pull
docker compose up -d --build
```

## Security Notes

- PostgreSQL is only accessible internally between Docker containers
- Use a firewall (e.g. `ufw`) to restrict access to only port 4000 (and SSH)
- For production use, consider adding HTTPS via a reverse proxy (nginx/Caddy)

```bash
# Example: allow only SSH and sync server
sudo ufw allow OpenSSH
sudo ufw allow 4000/tcp
sudo ufw enable
```
