# Running SmashRank in Production

This guide covers deploying SmashRank on a single server using Docker Compose with the pre-built image from GitHub Container Registry.

## Architecture

```
                    ┌─────────────┐
  Telegram ◄───────►│     bot     │──────►┐
                    └─────────────┘       │
                                          ▼
                    ┌─────────────┐  ┌──────────┐
  Browser ◄────────►│  api + web  │──►│ postgres │
                    └──────┬──────┘  └──────────┘
                           │
                     port 3000
```

Three containers run from the **same image** (`ghcr.io/dbarbashov/smashrank`), each with a different command:

| Service | What it does | Command |
|---------|-------------|---------|
| **migrate** | Runs DB migrations then exits | `node packages/db/dist/migrate.js` |
| **bot** | Telegram bot + scheduler | `node packages/bot/dist/index.js` (default CMD) |
| **api** | REST API + serves the web SPA | `node packages/api/dist/index.js` |

## Prerequisites

- Docker and Docker Compose v2+ installed
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Quick Start

### 1. Clone the repo (for the compose file)

```bash
git clone https://github.com/dbarbashov/smashrank.git
cd smashrank
```

Or just grab the two files you need:

```bash
mkdir smashrank && cd smashrank
curl -LO https://raw.githubusercontent.com/dbarbashov/smashrank/main/docker-compose.prod.yml
```

### 2. Create an `.env` file

```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=change-me-to-a-strong-password
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
DEFAULT_LANG=en
API_PORT=3000
EOF
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | Yes | — | Password for the PostgreSQL database |
| `TELEGRAM_BOT_TOKEN` | Yes | — | Token from @BotFather |
| `DEFAULT_LANG` | No | `en` | Default language (`en` or `ru`) |
| `API_PORT` | No | `3000` | Host port for the web dashboard |

### 3. Start everything

```bash
docker compose -f docker-compose.prod.yml up -d
```

This will:
1. Pull the `ghcr.io/dbarbashov/smashrank:latest` image
2. Start PostgreSQL and wait for it to be healthy
3. Run database migrations (then exit)
4. Start the bot and API services

### 4. Verify

```bash
# Check all services are running
docker compose -f docker-compose.prod.yml ps

# Check bot logs
docker compose -f docker-compose.prod.yml logs bot

# Check API is responding
curl http://localhost:3000/api/g/YOUR_GROUP_SLUG/info
```

The web dashboard is available at `http://localhost:3000`.

## Updating

Pull the latest image and recreate containers:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Migrations run automatically on every start — they skip already-applied migrations, so this is safe to repeat.

## Pinning a Version

By default, the compose file uses `:latest`. To pin to a specific commit:

```bash
# In docker-compose.prod.yml, replace :latest with a git SHA tag:
# image: ghcr.io/dbarbashov/smashrank:sha-abc1234
```

Check available tags at `https://github.com/dbarbashov/smashrank/pkgs/container/smashrank`.

## Reverse Proxy (optional)

To expose the web dashboard with HTTPS, put a reverse proxy in front of port 3000. Example with Caddy:

```
smashrank.example.com {
    reverse_proxy localhost:3000
}
```

Or with nginx:

```nginx
server {
    listen 443 ssl;
    server_name smashrank.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Backup & Restore

The PostgreSQL data lives in a Docker volume called `pgdata`.

```bash
# Backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U smashrank smashrank > backup.sql

# Restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U smashrank smashrank < backup.sql
```

## Troubleshooting

**Bot doesn't respond:**
```bash
docker compose -f docker-compose.prod.yml logs bot --tail 50
```
Check that `TELEGRAM_BOT_TOKEN` is correct and the bot isn't running elsewhere (Telegram only allows one polling connection per token).

**Migration fails:**
```bash
docker compose -f docker-compose.prod.yml logs migrate
```
The migrate service exits after running. Check its logs for SQL errors.

**Web dashboard shows "Group not found":**
The dashboard URL must include a valid group slug (e.g., `http://localhost:3000/g/my-group`). The group is created automatically the first time someone uses the bot in a Telegram group.

**Reset everything:**
```bash
docker compose -f docker-compose.prod.yml down -v  # -v removes the database volume
docker compose -f docker-compose.prod.yml up -d
```
