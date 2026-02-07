# SmashRank

ELO rating system for office table tennis, delivered as a Telegram bot with a web dashboard. Players log match results in a group chat and the bot tracks ratings, streaks, head-to-head records, achievements, doubles, tournaments, and seasonal rankings.

## Features

- **ELO ratings** with K-factor scaling based on games played
- **Match logging** via `/game @user 11-7 11-5` or guided `/newgame` flow with inline keyboards
- **Doubles** support (`/doubles`, `/newdoubles`)
- **Tournaments** — round-robin format with standings, fixtures, draw support, and auto-completion
- **Achievements** — unlockable badges for streaks, upsets, milestones, and tournament performance
- **Leaderboard**, per-player **stats**, and **head-to-head** records
- **Win/loss streaks** tracking with best streak history
- **Seasonal resets** with snapshot archival
- **Web dashboard** — leaderboard, player profiles, match history, seasons, tournaments
- **REST API** — JSON endpoints for all data
- **LLM commentary** on match results and weekly digests (OpenRouter, optional)
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
| `/doubles @p1 @p2 @p3 2-0` | Log a doubles match |
| `/newdoubles` | Guided doubles match logging |
| `/tournament create Name` | Create a round-robin tournament |
| `/tournament join` | Join an open tournament |
| `/tournament start` | Start the tournament (admin, 3+ players) |
| `/tournament standings` | View current standings |
| `/tournament fixtures` | View fixture list |
| `/tournament end` | Force-complete or cancel (admin) |
| `/tgame @user 11-7 11-5` | Log a tournament match |
| `/undo` | Undo last match (within 5 min) |
| `/leaderboard` | Group rankings |
| `/stats` or `/stats @user` | Player statistics |
| `/h2h @user` | Head-to-head record |
| `/achievements` | Your achievements |
| `/settings` | Group settings (commentary, achievements, digest) |
| `/web` | Link to the web dashboard |
| `/lang en\|ru` | Change language |
| `/help` | Show help |

## Project Structure

```
packages/
  db/       Postgres connection, migrations, query functions
  core/     ELO engine, streak logic, score parser, seasons, i18n, LLM client
  bot/      grammY Telegram bot, commands, middleware
  api/      Hono REST API
  web/      React SPA (Vite + Tailwind)
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
# Required
TELEGRAM_BOT_TOKEN=       # from @BotFather
DATABASE_URL=postgres://smashrank:smashrank@localhost:5432/smashrank

# Optional
DEFAULT_LANG=en           # default language for new groups (en or ru)
WEB_URL=http://localhost:3000  # enables /web command in bot
PORT=3000                 # API server port
STATIC_DIR=               # path to web dist/ for API to serve the SPA

# Optional — LLM commentary
OPENROUTER_API_KEY=       # enables match + digest commentary
OPENROUTER_MODEL=google/gemini-2.0-flash-001
```

### Run migrations

```bash
pnpm run migrate
```

### Start

```bash
# Development — bot with hot reload
pnpm run dev

# Production — bot
node --env-file=.env packages/bot/dist/index.js

# Production — API (serves REST API + web dashboard)
STATIC_DIR=./packages/web/dist node --env-file=.env packages/api/dist/index.js
```

## Docker

```bash
docker build -f packages/bot/Dockerfile -t smashrank .
docker run --env-file .env smashrank
```

Pre-built images are published to `ghcr.io/dbarbashov/smashrank` on every push to main.

For a full production setup with Docker Compose, see [docs/production.md](docs/production.md).

## Tests

```bash
pnpm run test
```

Unit tests run without a database. E2E tests require `TEST_DATABASE_URL` to be set (runs automatically in CI).

## Tech Stack

- **TypeScript** with `module: "NodeNext"`
- **pnpm** workspaces monorepo
- **postgres** (porsager/postgres) — raw SQL, no ORM
- **grammY** — Telegram bot framework
- **Hono** — REST API framework
- **React** + **Vite** + **Tailwind CSS** — web dashboard
- **Vitest** — testing
- **i18next** — internationalization
- **OpenRouter** — LLM commentary (optional, native `fetch`)
