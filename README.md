# SmashRank

ELO rating system for office table tennis, delivered as a Telegram bot. Players log match results in a group chat and the bot tracks ratings, streaks, head-to-head records, and seasonal rankings. Optionally generates witty match commentary via an LLM (OpenRouter).

## Features

- **ELO ratings** with K-factor scaling based on games played
- **Match logging** via `/game @user 11-7 11-5` or guided `/newgame` flow with inline keyboards
- **Leaderboard**, per-player **stats**, and **head-to-head** records
- **Win/loss streaks** tracking with best streak history
- **Seasonal resets** with snapshot archival
- **LLM commentary** on match results (OpenRouter, optional)
- **i18n** support (English and Russian)
- **Undo** last match within 5 minutes

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Register yourself |
| `/game @user 11-7 11-5` | Log a match with set scores |
| `/game @user 2-0` | Log with set count only |
| `/game @user won 2-1` | Explicit winner declaration |
| `/newgame` | Guided match logging with inline buttons |
| `/undo` | Undo last match (within 5 min) |
| `/leaderboard` | Group rankings |
| `/stats` or `/stats @user` | Player statistics |
| `/h2h @user` | Head-to-head record |
| `/lang en\|ru` | Change language |
| `/help` | Show help |

## Project Structure

```
packages/
  db/       Postgres connection, migrations, query functions
  core/     ELO engine, streak logic, score parser, seasons, i18n, LLM client
  bot/      grammY Telegram bot, commands, middleware
```

## Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL

### Install and build

```bash
pnpm install
pnpm run build
```

### Configure

Copy `.env.example` to `.env` and fill in the values:

```
TELEGRAM_BOT_TOKEN=       # from @BotFather
DATABASE_URL=postgres://smashrank:smashrank@localhost:5432/smashrank
DEFAULT_LANG=ru           # default language for new groups/players
OPENROUTER_API_KEY=       # optional, enables LLM commentary
OPENROUTER_MODEL=google/gemini-2.0-flash-001  # optional
```

### Run migrations

```bash
pnpm run migrate
```

### Start

```bash
# Development (with hot reload)
pnpm run dev

# Production
node --env-file=.env packages/bot/dist/index.js
```

## Docker

```bash
docker build -f packages/bot/Dockerfile -t smashrank .
docker run --env-file .env smashrank
```

Pre-built images are published to `ghcr.io/dbarbashov/smashrank` on every push to main.

## Tests

```bash
pnpm run test
```

## Tech Stack

- **TypeScript** with `module: "NodeNext"`
- **pnpm** workspaces monorepo
- **postgres** (porsager/postgres) — raw SQL, no ORM
- **grammY** — Telegram bot framework
- **Vitest** — testing
- **i18next** — internationalization
- **OpenRouter** — LLM commentary (optional, native `fetch`)
