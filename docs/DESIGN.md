# SmashRank — Design Document

**Office Table Tennis ELO Rating System**
Version: 1.0
Date: February 2026

---

## 1. Overview

SmashRank is a lightweight ELO rating system for office table tennis. Players log match results via a Telegram bot in a group chat, and a web frontend displays rankings, stats, and history. The bot uses an LLM (via OpenRouter API) to generate contextual, personality-rich commentary on match results, achievements, and digests.

### Core Principles

- **Group-chat-first** — the Telegram group is the primary interface. DMs are secondary for private stat checks.
- **Minimal friction** — logging a game should take <10 seconds.
- **Social by design** — public results, achievements, and commentary drive engagement and friendly competition.
- **LLM-enhanced, not LLM-dependent** — AI commentary is a flavor layer. All core functionality (ELO calc, match logging, leaderboards) works without it. If OpenRouter is down, fall back to templated messages.

---

## 2. Architecture

```
┌─────────────────┐       ┌─────────────────────────────┐
│  Telegram Bot    │──────▶│          Backend API         │
│  (group chat +   │◀──────│        (REST / JSON)        │
│   DM support)   │       │                             │
└─────────────────┘       │  ┌───────────┐ ┌─────────┐ │       ┌────────────┐
                          │  │ ELO Engine│ │ OpenRouter│──────▶│ LLM Provider│
                          │  └───────────┘ │  Client  │ │       └────────────┘
┌─────────────────┐       │               └─────────┘ │
│  Web Frontend   │──────▶│                             │
│  (SPA / SSR)    │◀──────│        ┌──────────┐        │
└─────────────────┘       │        │ Database │        │
                          │        └──────────┘        │
                          └─────────────────────────────┘
```

### Tech Stack (Recommended)

| Layer | Technology | Notes |
|---|---|---|
| Telegram Bot | `node-telegram-bot-api` or `grammY` | grammY preferred — better TypeScript support, middleware |
| Backend | Node.js + TypeScript | Single service handles bot + API |
| Web Framework | Fastify or Express | Fastify preferred for performance |
| Database | PostgreSQL | Reliable, good for relational data |
| ORM | Prisma or Drizzle | Type-safe queries |
| Frontend | React (Vite) or Next.js | SSR optional, SPA is fine |
| LLM | OpenRouter API | Model configurable per message type |
| Hosting | VPS / Railway / Fly.io | Needs persistent process for bot polling |

> **Note:** Tech stack is a recommendation. Team can adjust based on preference. The design is framework-agnostic.

---

## 3. Data Model

### 3.1 Players

```sql
CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  display_name  TEXT NOT NULL,
  elo_rating    INTEGER NOT NULL DEFAULT 1000,
  games_played  INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,  -- positive = wins, negative = losses
  best_streak   INTEGER NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active   TIMESTAMPTZ,
  language      TEXT NOT NULL DEFAULT 'en'  -- 'en' | 'ru', used for DM responses
);
```

### 3.2 Groups

```sql
CREATE TABLE groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       BIGINT UNIQUE NOT NULL,     -- Telegram group chat ID
  name          TEXT,                        -- group display name
  slug          TEXT UNIQUE NOT NULL,        -- unguessable URL slug for web frontend
  language      TEXT NOT NULL DEFAULT 'en',  -- 'en' | 'ru'
  settings      JSONB NOT NULL DEFAULT '{}', -- digest schedule, quiet hours, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.3 Seasons

```sql
CREATE TABLE seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  name        TEXT NOT NULL,               -- e.g. "S1 2026 (Jan–Feb)"
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seasons reset every ~3 months on fixed dates: **Jan 1, Mar 1, Jun 1, Sep 1**. Created automatically by a cron job. When a new season starts, all players' `elo_rating` resets to 1000. Previous season data is preserved — the `elo_before`/`elo_after` on match records and a snapshot table allow full historical reconstruction.

```sql
CREATE TABLE season_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES seasons(id),
  player_id   UUID NOT NULL REFERENCES players(id),
  final_elo   INTEGER NOT NULL,
  final_rank  INTEGER NOT NULL,
  games_played INTEGER NOT NULL,
  wins        INTEGER NOT NULL,
  losses      INTEGER NOT NULL,
  UNIQUE(season_id, player_id)
);
```

### 3.4 Matches

```sql
CREATE TABLE matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type    TEXT NOT NULL DEFAULT 'singles', -- 'singles' | 'doubles'
  season_id     UUID NOT NULL REFERENCES seasons(id),
  tournament_id UUID REFERENCES tournaments(id), -- NULL if not a tournament match
  group_id      UUID NOT NULL REFERENCES groups(id),

  -- Singles: winner/loser directly. Doubles: winner/loser refer to teams.
  winner_id     UUID NOT NULL REFERENCES players(id),  -- or team captain for doubles
  loser_id      UUID NOT NULL REFERENCES players(id),   -- or team captain for doubles

  -- Doubles partners (NULL for singles)
  winner_partner_id UUID REFERENCES players(id),
  loser_partner_id  UUID REFERENCES players(id),

  winner_score  INTEGER NOT NULL,  -- sets won
  loser_score   INTEGER NOT NULL,  -- sets won
  set_scores    JSONB,             -- e.g. [{"w": 11, "l": 7}, {"w": 11, "l": 5}]

  elo_before_winner INTEGER NOT NULL,
  elo_before_loser  INTEGER NOT NULL,
  elo_change    INTEGER NOT NULL,

  -- For doubles: partner ELO snapshots
  elo_before_winner_partner INTEGER,
  elo_before_loser_partner  INTEGER,

  reported_by   UUID NOT NULL REFERENCES players(id),
  played_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.5 Achievements

```sql
CREATE TABLE achievement_definitions (
  id          TEXT PRIMARY KEY,         -- e.g. 'giant_killer', 'first_blood'
  name        TEXT NOT NULL,            -- e.g. 'Giant Killer'
  description TEXT NOT NULL,            -- e.g. 'Beat a player 200+ ELO above you'
  emoji       TEXT NOT NULL DEFAULT '🏅'
);

CREATE TABLE player_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID NOT NULL REFERENCES players(id),
  achievement_id TEXT NOT NULL REFERENCES achievement_definitions(id),
  match_id       UUID REFERENCES matches(id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, achievement_id)  -- each achievement earned once
);
```

### 3.6 Tournaments

```sql
CREATE TABLE tournaments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES groups(id),
  season_id    UUID NOT NULL REFERENCES seasons(id),
  name         TEXT NOT NULL,                          -- e.g. "February Cup"
  status       TEXT NOT NULL DEFAULT 'signup',         -- 'signup' | 'active' | 'completed'
  created_by   UUID NOT NULL REFERENCES players(id),
  signup_deadline TIMESTAMPTZ,                         -- optional: auto-close signups
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE tournament_participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  player_id     UUID NOT NULL REFERENCES players(id),
  signed_up_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tournament_id, player_id)
);

CREATE TABLE tournament_standings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  player_id     UUID NOT NULL REFERENCES players(id),
  points        INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  draws         INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  sets_won      INTEGER NOT NULL DEFAULT 0,
  sets_lost     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournament_id, player_id)
);
```

---

## 4. ELO Calculation

Standard ELO with K-factor adjustments.

### Formula

```
Expected Score:  E_a = 1 / (1 + 10^((R_b - R_a) / 400))
New Rating:      R_a' = R_a + K * (S - E_a)
```

Where `S` = 1 for win, 0 for loss.

### K-Factor Rules

| Condition | K-Factor | Rationale |
|---|---|---|
| Player has < 10 games | 40 | Faster calibration for new players |
| Player has 10–30 games | 24 | Standard adjustment |
| Player has > 30 games | 16 | More stable ratings for veterans |

### Implementation Notes

- ELO is calculated per match (not per set). A 2-1 win counts the same as a 2-0 win for ELO purposes. This keeps it simple and avoids gaming incentives.
- Both players' ratings update atomically in a single transaction.
- Store `elo_before` on each match record so history can be reconstructed and charts rendered without replaying all matches.
- Minimum ELO floor: 100 (prevents negative spirals for new players).

---

## 5. Telegram Bot

### 5.1 Commands

| Command | Context | Description |
|---|---|---|
| `/start` | Group / DM | Register player (auto-registers on first use of any command) |
| `/game @user 11-7 11-5` | Group (primary) | Log a match result |
| `/newgame` | Group / DM | Guided match entry via inline keyboard |
| `/leaderboard` | Group / DM | Show top players |
| `/stats` | Group / DM | Your personal stats |
| `/stats @user` | Group / DM | Another player's stats |
| `/h2h @user` | Group / DM | Head-to-head record |
| `/challenge @user` | Group | Public challenge |
| `/accept` / `/decline` | Group | Respond to challenge |
| `/achievements` | Group / DM | Your achievements or recent group unlocks |
| `/doubles @partner vs @opp1 @opp2 [scores]` | Group | Log a doubles match |
| `/newdoubles` | Group / DM | Guided doubles match entry |
| `/leaderboard doubles` | Group / DM | Doubles rankings |
| `/tournament create [name]` | Group (admin) | Create a tournament |
| `/tournament join` | Group | Sign up for active tournament |
| `/tournament start` | Group (admin) | Close signups, begin tournament |
| `/tournament standings` | Group / DM | Tournament standings |
| `/tournament fixtures` | Group / DM | All fixtures and status |
| `/tournament end` | Group (admin) | Force-complete stalled tournament |
| `/tgame @opponent [scores]` | Group | Log a tournament match (up to 4 sets) |
| `/help` | Group / DM | Command reference |
| `/settings` | Group (admin) | Configure bot behavior for the group |
| `/lang en\|ru` | DM | Set your personal language preference |

### 5.2 Match Logging Flow

**Quick command (primary):**

```
User:  /game @bob 11-7 11-5
Bot:   [LLM-generated match commentary — see Section 6]
```

**Guided flow (fallback for new users):**

```
User:  /newgame
Bot:   "Who did you play?" → [inline keyboard: recent opponents]
User:  [taps @bob]
Bot:   "Who won?" → [I won / They won]
User:  [taps "I won"]
Bot:   "Enter set scores (e.g. 11-7 11-5)"
User:  11-7 11-5
Bot:   [LLM-generated match commentary]
```

### 5.3 Input Parsing

The `/game` command should be flexible. All of these should work:

```
/game @bob 11-7 11-5
/game @bob 11-7, 11-5
/game @bob 2-0            ← sets only, no point scores
/game @bob won 2-1        ← explicit winner declaration
```

**Validation rules:**
- Both players must be registered (auto-register if not).
- A player cannot play against themselves.
- Set scores must be valid (winning score ≥ 11, win by 2 in deuce, e.g. 12-10 is valid).
- Cooldown: same two players can't log more than 1 match per 2 minutes (prevents accidental duplicates).
- `/undo` — reporter can undo last match within 5 minutes.

### 5.4 Group Chat Behavior

- Bot only responds to commands and direct mentions. No unsolicited messages except scheduled digests.
- Keep messages concise. One message per event (don't send match result + achievement as separate messages — combine them).
- Respect quiet hours if configured via `/settings`.

### 5.5 Admin Settings

Group admins (Telegram group admins) can configure:

```
/settings digest [daily|weekly|off]     — when to post roundups
/settings commentary [on|off]           — LLM commentary vs plain results
/settings achievements [on|off]         — achievement announcements
/settings quiet [22:00-08:00]           — no bot messages during these hours
```

---

## 6. OpenRouter LLM Integration

### 6.1 Purpose

The LLM generates short, contextual, personality-rich messages for:

1. **Match results** — instead of a static template, the bot comments on the match dynamically.
2. **Achievement unlocks** — unique flavor text per achievement.
3. **Weekly digests** — narrative summary of the week.
4. **Challenge commentary** — hype up challenges.

### 6.2 Integration Architecture

```
Match Logged
    │
    ▼
Build context object (players, ELO, streaks, h2h, achievements)
    │
    ▼
Send to OpenRouter API with system prompt + context
    │
    ▼
Receive short message (50–150 tokens)
    │
    ▼
Post to Telegram
    │
    ▼
(If OpenRouter fails → fall back to template)
```

### 6.3 OpenRouter API Usage

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "meta-llama/llama-4-scout",  // cheap, fast, good enough
    max_tokens: 200,
    temperature: 0.9,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(matchContext) }
    ]
  })
});
```

**Model selection guidance:**
- Match results / achievements: use a small, fast, cheap model (Llama 4 Scout, Gemini Flash, etc.)
- Weekly digests: can use a slightly better model since it's once a week
- Keep costs minimal — these are short generations. Expected cost: <$1/month for a typical office.

### 6.4 System Prompt

```
You are SmashRank, a witty sports commentator for an office ping pong league.
You generate SHORT, fun, engaging messages about match results.

Rules:
- Max 3 lines of text. Be concise.
- Use 1-2 relevant emojis per message.
- Reference the context: streaks, rivalries, rank changes, upsets.
- Vary your style: sometimes hype, sometimes dry humor, sometimes dramatic.
- Never be mean or personal — keep it lighthearted.
- Always include the ELO changes as: "PlayerName: 1000 → 1016 (+16)"
- If an achievement was unlocked, mention it naturally in the same message.

Tone examples:
- Upset: "The office has a new giant killer..."
- Streak: "That's 5 in a row. Someone stop this person."
- Close match: "3 sets of pure chaos."
- Dominant win: "That wasn't a match, that was a statement."
```

### 6.5 Context Object (sent as user message)

```typescript
interface MatchContext {
  type: "match_result" | "achievement" | "weekly_digest" | "challenge" | "tournament_match" | "tournament_complete";

  // Match data
  match_type: "singles" | "doubles" | "tournament";
  winner: { name: string; elo_before: number; elo_after: number; rank: number };
  loser:  { name: string; elo_before: number; elo_after: number; rank: number };
  set_scores: string;         // "11-7, 11-5"
  elo_change: number;

  // Doubles (optional)
  winner_partner?: { name: string };
  loser_partner?: { name: string };

  // Context
  is_upset: boolean;          // lower ELO player won
  elo_gap: number;            // difference before match
  winner_streak: number;
  loser_streak: number;
  h2h_record: string;         // "Winner leads 5-3"
  rank_change: boolean;       // did rankings shift?

  // Tournament context (optional)
  tournament?: {
    name: string;
    is_draw: boolean;          // 2-2 result
    winner_points: number;
    standings_summary: string; // top 3 + remaining matches count
    is_final_match: boolean;
    champion?: string;         // set when tournament completes
  };

  // Achievements unlocked (if any)
  achievements: { player: string; name: string; emoji: string }[];
}
```

### 6.6 Fallback Templates

If OpenRouter is unreachable or returns an error, use static templates:

```typescript
const templates = {
  normal: "🏓 {winner} beat {loser} {score}\n📈 {winner}: {elo_w_before} → {elo_w_after} (+{change})\n📉 {loser}: {elo_l_before} → {elo_l_after} (-{change})",
  upset:  "🚨 Upset! {winner} beat {loser} {score}\n📈 {winner}: {elo_w_before} → {elo_w_after} (+{change})\n📉 {loser}: {elo_l_before} → {elo_l_after} (-{change})",
};
```

---

## 7. Achievement System

### 7.1 Achievement Definitions

| ID | Name | Emoji | Condition |
|---|---|---|---|
| `first_blood` | First Blood | 🩸 | Win your first match |
| `on_fire` | On Fire | 🔥 | Win 5 matches in a row |
| `unstoppable` | Unstoppable | 💀 | Win 10 matches in a row |
| `giant_killer` | Giant Killer | 🗡️ | Beat a player 200+ ELO above you |
| `iron_man` | Iron Man | 🦾 | Play 50 matches |
| `centurion` | Centurion | 💯 | Play 100 matches |
| `top_dog` | Top Dog | 👑 | Reach rank #1 |
| `comeback_kid` | Comeback Kid | 🔄 | Win a match after losing 3+ in a row |
| `rivalry` | Rival | ⚔️ | Play the same opponent 10 times |
| `perfect_game` | Flawless | ✨ | Win a set 11-0 |
| `heartbreaker` | Heartbreaker | 💔 | Win a 3-set match after losing the first set |
| `newcomer_threat` | Newcomer Threat | 🌟 | Win 5 of your first 10 games |

### 7.2 Evaluation

Achievements are checked after every match in a post-match hook. The check runs synchronously before the bot message is composed, so achievements can be included in the LLM context for that match.

```typescript
async function evaluateAchievements(match: Match): Promise<Achievement[]> {
  const unlocked: Achievement[] = [];

  // Check each achievement condition
  if (match.winner.games_played === 1) unlocked.push("first_blood");
  if (match.winner.current_streak >= 5) unlocked.push("on_fire");
  if (match.winner.current_streak >= 10) unlocked.push("unstoppable");
  if (match.elo_gap >= 200 && winner is lower rated) unlocked.push("giant_killer");
  // ... etc

  // Persist and return only newly unlocked ones
  return await persistNewAchievements(unlocked, match);
}
```

---

## 8. Seasons

### 8.1 Schedule

Seasons follow a fixed schedule, resetting every ~3 months:

| Season | Start | End |
|---|---|---|
| S1 | January 1 | February 28/29 |
| S2 | March 1 | May 31 |
| S3 | June 1 | August 31 |
| S4 | September 1 | December 31 |

### 8.2 Season Transition

When a new season starts (automated via cron at midnight on the start date):

1. **Snapshot** — write each player's final ELO, rank, W/L to `season_snapshots`.
2. **Reset** — set all players' `elo_rating` to 1000, reset `games_played`, `wins`, `losses`, `current_streak` to 0.
3. **Create season** — insert new `seasons` row, set `is_active = true`, deactivate previous.
4. **Announce** — bot posts to group chat:

```
🏆 Season S4 2025 is over!

🥇 Alice — 1342 (Final ELO)
🥈 Bob — 1281
🥉 Charlie — 1198

🆕 Season S1 2026 has begun! All ratings reset to 1000. Let's go! 🏓
```

### 8.3 Historical Data

All match records retain their `season_id`, so per-season stats and ELO charts are always available. The web frontend allows switching between seasons and viewing an all-time aggregate.

### 8.4 Leaderboard Behavior

- `/leaderboard` always shows the **current season** by default.
- `/leaderboard alltime` shows all-time aggregated stats (total wins, games, best-ever ELO).
- Web frontend has a season selector dropdown.

---

## 9. Doubles Support

### 9.1 Overview

Players can log doubles matches. Each team is 2 players. ELO is tracked per-player (not per-team) — both members of the winning team gain ELO, both losers lose ELO.

### 9.2 Logging a Doubles Match

```
/doubles @alice @bob vs @charlie @dave 11-7 11-5
```

This means: team (reporter + @alice) if the reporter is one of the four, or explicitly lists all four.

**Simplified syntax — reporter is always on a team:**

```
/doubles @alice vs @bob @charlie 11-7 9-11 11-8
```

Means: (reporter + @alice) beat (@bob + @charlie) 2-1.

**Guided flow:**

```
User:  /newdoubles
Bot:   "Who's your partner?" → [inline keyboard]
User:  [taps @alice]
Bot:   "Who did you play against?" → [inline keyboard, multi-select 2]
User:  [taps @bob, @charlie]
Bot:   "Who won?" → [We won / They won]
...
```

### 9.3 ELO for Doubles

- **Team ELO** is calculated as the average of both players' ELO on each side.
- ELO change is computed using team averages, then applied equally to both members of each team.
- K-factor uses the **lower** games_played of the two team members (more generous to newer players).

```typescript
const teamA_elo = (playerA1.elo + playerA2.elo) / 2;
const teamB_elo = (playerB1.elo + playerB2.elo) / 2;
const expected = 1 / (1 + Math.pow(10, (teamB_elo - teamA_elo) / 400));
const change = Math.round(K * (1 - expected)); // if teamA wins
// Apply +change to both A1, A2; apply -change to both B1, B2
```

### 9.4 Doubles Stats

- Separate doubles W/L and ELO history tracked alongside singles.
- "Best Partner" stat: which teammate you win most with.
- Web frontend shows doubles matches in a distinct style.

### 9.5 Bot Commands for Doubles

| Command | Description |
|---|---|
| `/doubles @partner vs @opp1 @opp2 [scores]` | Log a doubles match |
| `/newdoubles` | Guided doubles match entry |
| `/leaderboard doubles` | Doubles win rate ranking |

---

## 10. Tournaments

### 10.1 Overview

Tournaments are round-robin events within a season. Every participant plays every other participant. Matches are played up to 4 sets (not the usual best-of-3/best-of-5). Scoring uses a points system instead of ELO.

### 10.2 Tournament Rules

- **Format:** Round-robin (everyone plays everyone once).
- **Match format:** Up to 4 sets per match.
- **Scoring:**
  - **Win** (e.g. 3-1, 4-0, 3-0, 4-1) = **3 points**
  - **Draw** (2-2) = **1 point each**
  - **Loss** = **0 points**
- **Tiebreakers** (in order):
  1. Total points
  2. Head-to-head result between tied players
  3. Set difference (sets won - sets lost)
  4. If still tied, higher season ELO at time of tiebreak

### 10.3 Tournament Lifecycle

```
SIGNUP → ACTIVE → COMPLETED

/tournament create "February Cup"     → Creates tournament, opens signups
/tournament join                       → Join the tournament
/tournament start                      → Admin closes signups, generates fixture list
/tgame @opponent 11-7 11-5 9-11 11-8  → Log a tournament match
/tournament standings                  → View current standings
                                       → Auto-completes when all fixtures played
```

### 10.4 Detailed Flows

**Creating a tournament:**

```
Admin:  /tournament create February Cup
Bot:    🏆 Tournament "February Cup" created!
        Sign up with /tournament join
        Currently signed up: 1 (admin auto-joined)
```

**Signing up:**

```
User:   /tournament join
Bot:    ✅ @alice joined "February Cup"!
        Signed up: 4 players (Alice, Bob, Charlie, Dave)
```

**Starting the tournament:**

```
Admin:  /tournament start
Bot:    🏆 "February Cup" is LIVE! 4 players, 6 matches to play.

        📋 Fixtures:
        ○ Alice vs Bob
        ○ Alice vs Charlie
        ○ Alice vs Dave
        ○ Bob vs Charlie
        ○ Bob vs Dave
        ○ Charlie vs Dave

        Log matches with: /tgame @opponent [scores]
        Up to 4 sets per match. 2-2 is a draw!
```

**Logging a tournament match:**

```
User:   /tgame @bob 11-7 11-5 9-11 11-8
Bot:    🏆 TOURNAMENT: February Cup
        Alice beat Bob 3-1 (11-7, 11-5, 9-11, 11-8)

        📊 Standings:
        1. Alice    — 6 pts (2W 0D 0L)
        2. Charlie  — 3 pts (1W 0D 0L)
        3. Dave     — 1 pt  (0W 1D 0L)
        4. Bob      — 1 pt  (0W 1D 1L)

        🏓 4 of 6 matches played
```

**Tournament completion:**

When the final fixture is played, the bot auto-announces:

```
Bot:    🏆🏆🏆 TOURNAMENT COMPLETE: February Cup 🏆🏆🏆

        🥇 Alice    — 9 pts (3W 0D 0L) — CHAMPION!
        🥈 Charlie  — 4 pts (1W 1D 1L)
        🥉 Bob      — 3 pts (1W 0D 2L)
        4. Dave     — 1 pt  (0W 1D 2L)

        👑 @alice earns the "Tournament Champion" achievement!
```

### 10.5 Tournament Match vs Regular Match

| Aspect | Regular match (`/game`) | Tournament match (`/tgame`) |
|---|---|---|
| Sets | Best of 3 or best of 5 | Up to 4 sets (2-2 draw allowed) |
| Scoring | ELO change | Points (3W / 1D / 0L) |
| ELO impact | Yes | **Also yes** — tournament matches count for ELO too |
| Shows on leaderboard | Yes | Yes |
| Shows in tournament standings | No | Yes |

> **Design note:** Tournament matches affect ELO because they're real competitive games. A draw (2-2) counts as 0.5 for both players in ELO terms (i.e. `S = 0.5` in the formula). This means a draw against a higher-rated player is still an ELO gain for the lower-rated player.

### 10.6 Constraints

- Only one active tournament per group at a time.
- Minimum 3 players to start a tournament.
- Maximum 12 players (to keep fixture count manageable — 12 players = 66 matches).
- Tournament matches can only be logged between tournament participants.
- Regular `/game` matches can still be played during an active tournament — they just don't count for tournament standings.
- If a tournament stalls (no new matches for 14 days), an admin can force-complete it with `/tournament end` — unplayed matches are recorded as 0-0 draws (1 point each).

### 10.7 Tournament Commands

| Command | Context | Description |
|---|---|---|
| `/tournament create [name]` | Group (admin) | Create a new tournament |
| `/tournament join` | Group | Sign up for the active tournament |
| `/tournament leave` | Group | Leave before tournament starts |
| `/tournament start` | Group (admin) | Close signups, begin tournament |
| `/tournament standings` | Group / DM | Current standings + remaining fixtures |
| `/tournament fixtures` | Group / DM | List all fixtures and their status |
| `/tournament end` | Group (admin) | Force-complete a stalled tournament |
| `/tgame @opponent [scores]` | Group | Log a tournament match |

### 10.8 Tournament Achievements

| ID | Name | Emoji | Condition |
|---|---|---|---|
| `tournament_champion` | Tournament Champion | 🏆 | Win a tournament |
| `tournament_undefeated` | Undefeated | 🛡️ | Win a tournament without a single loss |
| `tournament_ironman` | Tournament Iron Man | 🦾 | Participate in 5 tournaments |
| `draw_master` | Draw Master | 🤝 | Draw 3+ matches in a single tournament |

---

## 11. Web Frontend

### 11.1 Pages

**Leaderboard (home — `/g/:slug`)**
- Season selector dropdown (current season default)
- Ranked player list: rank, name, ELO, trend (↑↓ vs last week), W/L, win rate
- ELO sparkline per player (last 20 games)
- Toggle: Singles / Doubles
- Click player → profile

**Player Profile (`/g/:slug/player/:id`)**
- ELO history chart (line chart, per season + all-time)
- W/L stats, streaks, best/worst results
- Head-to-head table vs every opponent
- Recent matches (last 20)
- Achievements earned (with dates)
- Doubles stats: best partner, doubles W/L
- Tournament history

**Match History (`/g/:slug/matches`)**
- Chronological feed of all matches
- Filter by player, date range, match type (singles/doubles/tournament)
- Shows set scores, ELO changes, LLM commentary

**Achievements (`/g/:slug/achievements`)**
- Grid of all achievements with unlock progress
- Recent unlocks across all players

**Seasons Archive (`/g/:slug/seasons`)**
- List of all past seasons with champion, stats summary
- Click into any season to see its final leaderboard

**Tournament (`/g/:slug/tournament/:id`)**
- Current standings table (rank, player, pts, W/D/L, sets +/-)
- Fixture grid (matrix showing all matchups, completed ones with scores)
- Remaining matches list

### 11.2 API Endpoints

```
GET  /api/g/:slug/leaderboard              — ranked players list (current season)
GET  /api/g/:slug/leaderboard?season=:id   — ranked players for specific season
GET  /api/g/:slug/players/:id              — player profile + stats
GET  /api/g/:slug/players/:id/elo-history  — ELO over time
GET  /api/g/:slug/players/:id/matches      — player's match history
GET  /api/g/:slug/players/:id/h2h/:otherId — head-to-head stats
GET  /api/g/:slug/matches                  — all matches (paginated, filterable)
GET  /api/g/:slug/matches/:id              — single match detail
GET  /api/g/:slug/achievements             — all achievement definitions
GET  /api/g/:slug/achievements/recent      — recently unlocked achievements
GET  /api/g/:slug/seasons                  — all seasons for the group
GET  /api/g/:slug/seasons/:id              — season details + final standings
GET  /api/g/:slug/tournaments              — all tournaments
GET  /api/g/:slug/tournaments/:id          — tournament details, standings, fixtures
GET  /api/g/:slug/stats/weekly             — weekly digest data
```

All endpoints return JSON. No authentication required for read endpoints (it's a fun office tool, not Fort Knox). All URLs scoped to the group slug for future multi-group support.

---

## 12. Weekly Digest

Automated message posted to the group chat. Configurable schedule via `/settings`.

### Trigger

Cron job: default Friday 17:00 (configurable).

### Data Collected

```typescript
interface WeeklyDigest {
  period: { start: Date; end: Date };
  total_matches: number;
  most_active_player: { name: string; games: number };
  biggest_elo_gainer: { name: string; change: number };
  biggest_elo_loser: { name: string; change: number };
  longest_streak: { name: string; streak: number };
  upset_of_the_week: Match | null;
  new_achievements: PlayerAchievement[];
  rank_changes: { name: string; old_rank: number; new_rank: number }[];
}
```

This context is sent to OpenRouter with a digest-specific system prompt to generate a narrative weekly roundup (max ~300 tokens).

**Fallback template:**

```
📊 WEEKLY ROUNDUP ({start} – {end})
🏓 {total_matches} matches played
🏆 Player of the Week: {biggest_gainer} (+{change} ELO)
🔥 Longest Streak: {streak_player} ({streak} wins)
🚨 Upset of the Week: {upset_winner} over {upset_loser}
💪 Most Active: {active_player} ({games} games)
🌐 Full stats: {frontend_url}
```

---

## 13. Deployment & Configuration

### Environment Variables

```bash
# Telegram
TELEGRAM_BOT_TOKEN=            # from @BotFather

# Database
DATABASE_URL=                  # PostgreSQL connection string

# OpenRouter
OPENROUTER_API_KEY=            # from openrouter.ai
OPENROUTER_MODEL=meta-llama/llama-4-scout  # default model
OPENROUTER_MODEL_DIGEST=       # optional: better model for digests

# App
FRONTEND_URL=https://smashrank.app
DEFAULT_ELO=1000
DEFAULT_LANG=en                        # default language for new groups
ELO_FLOOR=100
SEASON_CRON=0 0 1 1,4,7,10 *  # Midnight on Jan 1, Apr 1, Jul 1, Oct 1
DIGEST_CRON=0 17 * * 5        # Friday 17:00

# Feature flags
ENABLE_LLM_COMMENTARY=true
ENABLE_ACHIEVEMENTS=true
ENABLE_WEEKLY_DIGEST=true
```

### Bot Setup

1. Create bot via @BotFather on Telegram.
2. Set bot commands via BotFather (`/setcommands`).
3. Add bot to the office group chat.
4. Grant bot permission to read messages (disable privacy mode via BotFather if using grammY/polling).

---

## 14. Project Structure

```
smashrank/
├── packages/
│   ├── bot/                   # Telegram bot
│   │   ├── commands/          # Command handlers
│   │   ├── middleware/        # Auto-registration, rate limiting
│   │   ├── parsers/           # Score input parsing
│   │   └── index.ts
│   ├── api/                   # REST API for frontend
│   │   ├── routes/
│   │   └── index.ts
│   ├── core/                  # Shared business logic
│   │   ├── elo.ts             # ELO calculation
│   │   ├── achievements.ts    # Achievement evaluation
│   │   ├── tournaments.ts     # Tournament logic + fixtures
│   │   ├── seasons.ts         # Season lifecycle + snapshots
│   │   ├── doubles.ts         # Doubles ELO + team logic
│   │   ├── digest.ts          # Weekly digest generation
│   │   ├── llm.ts             # OpenRouter client + prompts
│   │   └── i18n/              # Translation files
│   │       ├── en.json
│   │       ├── ru.json
│   │       └── index.ts       # i18n setup + t() helper
│   ├── db/                    # Database layer
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── frontend/              # Web app
│       ├── src/
│       └── public/
├── .env.example
├── docker-compose.yml
├── package.json               # Monorepo root
└── README.md
```

---

## 15. Milestones

### Phase 1 — MVP (Week 1–2)

- [ ] Database schema + migrations (players, groups, seasons, matches)
- [ ] ELO calculation engine with tests
- [ ] Season lifecycle: auto-creation, quarterly resets, snapshots
- [ ] Telegram bot: `/start`, `/game`, `/leaderboard`, `/stats`
- [ ] Score input parsing with validation (both set scores and set count)
- [ ] Static template responses (no LLM yet)
- [ ] i18n setup with English and Russian translation files
- [ ] Deploy bot to a VPS / Railway

**Goal:** People can log singles games and see rankings in Telegram. Seasons active. Both EN and RU supported.

### Phase 2 — LLM + Polish (Week 3)

- [ ] OpenRouter integration with system prompts
- [ ] LLM-generated match commentary
- [ ] Fallback templates when LLM is unavailable
- [ ] `/h2h` command
- [ ] `/undo` command
- [ ] `/newgame` guided flow

**Goal:** Bot feels alive with personality.

### Phase 3 — Achievements + Doubles + Digests (Week 4)

- [ ] Achievement system (definitions, evaluation, persistence)
- [ ] Achievement announcements in group chat
- [ ] Doubles match support (`/doubles`, `/newdoubles`, doubles ELO)
- [ ] Weekly digest cron job
- [ ] `/achievements` command
- [ ] `/settings` for group admins

**Goal:** Engagement loops in place. Doubles supported.

### Phase 4 — Web Frontend (Week 5–6)

- [ ] REST API endpoints (all scoped to group slug)
- [ ] Leaderboard page with season selector
- [ ] Player profile with ELO chart, doubles stats
- [ ] Match history page (filterable by type)
- [ ] Achievements page
- [ ] Season archive page
- [ ] Tournament standings page
- [ ] Mobile-responsive design

**Goal:** Full web experience for stats nerds.

### Phase 5 — Tournaments (Week 7)

- [ ] Tournament creation, signup, start flow
- [ ] Tournament match logging (`/tgame`) with 4-set format
- [ ] Points calculation (3W / 1D / 0L)
- [ ] Auto-completion when all fixtures played
- [ ] Tournament standings in bot + web frontend
- [ ] Tournament achievements
- [ ] Force-complete for stalled tournaments

**Goal:** Full tournament system running.

### Phase 6 — Nice-to-haves (Ongoing)

- [ ] Challenge system (`/challenge`, `/accept`)
- [ ] Multiple game types (foosball, etc.)
- [ ] Player avatars from Telegram
- [ ] Head-to-head visualizations on frontend
- [ ] Daily "matchup of the day" suggestions
- [ ] Multi-group support (multiple offices, shared web platform)
- [ ] Tournament brackets (single-elimination variant alongside round-robin)

---

## 16. Internationalization (i18n)

### 16.1 Overview

The system supports multiple languages from day one. Initial languages: **English (en)** and **Russian (ru)**. Language is configured per group chat and per user (for DMs).

### 16.2 Language Selection

| Context | How language is set | Default |
|---|---|---|
| Group chat | Group admin sets via `/settings lang en\|ru` | `en` |
| DM | User sets via `/lang en\|ru` | Inherits from their group, or `en` |

### 16.3 What Gets Translated

| Content Type | Translation Method | Notes |
|---|---|---|
| Bot commands output (leaderboard, stats, h2h headers, labels) | Static translation files | Standard i18n key-value |
| Error messages & validation | Static translation files | "Player not found", "Invalid score", etc. |
| Inline keyboard buttons | Static translation files | "I won" / "Я выиграл", etc. |
| LLM commentary (match results, digests) | OpenRouter prompt language | System prompt instructs the model to respond in the target language |
| Fallback templates | Static translation files | One set per language |
| Achievement names & descriptions | Static translation files | Stored as i18n keys, not raw strings |
| Web frontend | Frontend i18n (e.g. `react-i18next`) | Language toggle in UI |

### 16.4 Translation File Structure

```
packages/
  core/
    i18n/
      en.json
      ru.json
  frontend/
    src/
      i18n/
        en.json
        ru.json
```

**Example `en.json` (bot):**

```json
{
  "leaderboard.title": "🏓 Office Rankings",
  "leaderboard.empty": "No matches played yet. Start with /game!",
  "stats.title": "📊 Stats for {name}",
  "stats.elo": "ELO: {elo} (rank #{rank})",
  "stats.record": "Record: {wins}W - {losses}L ({winrate}%)",
  "stats.streak": "Streak: {streak}",
  "game.recorded": "✅ Match recorded!",
  "game.invalid_score": "❌ Invalid score. Example: /game @user 11-7 11-5",
  "game.self_play": "❌ You can't play against yourself.",
  "game.cooldown": "⏳ You just logged a match with this player. Wait a couple minutes.",
  "game.undo_success": "↩️ Last match undone.",
  "achievement.unlocked": "🏅 Achievement unlocked!",
  "achievement.first_blood": "First Blood — Win your first match",
  "achievement.giant_killer": "Giant Killer — Beat a player 200+ ELO above you",
  "achievement.on_fire": "On Fire — Win 5 matches in a row",
  "challenge.issued": "🏓 {challenger} challenges {opponent}!",
  "challenge.accept_prompt": "Accept? /accept or /decline",
  "challenge.accepted": "⚔️ It's ON! {player1} ({elo1}) vs {player2} ({elo2})",
  "digest.title": "📊 Weekly Roundup ({start} – {end})",
  "settings.lang_set": "Language set to English 🇬🇧",
  "doubles.recorded": "✅ Doubles match recorded!",
  "tournament.created": "🏆 Tournament \"{name}\" created! Sign up with /tournament join",
  "tournament.joined": "✅ {player} joined \"{name}\"! ({count} players signed up)",
  "tournament.started": "🏆 \"{name}\" is LIVE! {players} players, {matches} matches to play.",
  "tournament.complete": "🏆🏆🏆 TOURNAMENT COMPLETE: {name} 🏆🏆🏆",
  "tournament.match_recorded": "🏆 TOURNAMENT: {name}",
  "tournament.standings_header": "📊 Standings:",
  "tournament.remaining": "🏓 {played} of {total} matches played",
  "season.new": "🆕 Season {name} has begun! All ratings reset to 1000. Let's go! 🏓",
  "season.ended": "🏆 Season {name} is over!"
}
```

**Example `ru.json` (bot):**

```json
{
  "leaderboard.title": "🏓 Рейтинг офиса",
  "leaderboard.empty": "Ещё ни одной игры. Начни с /game!",
  "stats.title": "📊 Статистика {name}",
  "stats.elo": "ELO: {elo} (место #{rank})",
  "stats.record": "Результат: {wins}П - {losses}П ({winrate}%)",
  "stats.streak": "Серия: {streak}",
  "game.recorded": "✅ Матч записан!",
  "game.invalid_score": "❌ Неверный счёт. Пример: /game @user 11-7 11-5",
  "game.self_play": "❌ Нельзя играть против самого себя.",
  "game.cooldown": "⏳ Вы только что записали матч с этим игроком. Подождите пару минут.",
  "game.undo_success": "↩️ Последний матч отменён.",
  "achievement.unlocked": "🏅 Достижение разблокировано!",
  "achievement.first_blood": "Первая кровь — Выиграй свой первый матч",
  "achievement.giant_killer": "Убийца гигантов — Победи игрока с ELO на 200+ выше",
  "achievement.on_fire": "В огне — Выиграй 5 матчей подряд",
  "challenge.issued": "🏓 {challenger} вызывает {opponent}!",
  "challenge.accept_prompt": "Принять? /accept или /decline",
  "challenge.accepted": "⚔️ Поехали! {player1} ({elo1}) vs {player2} ({elo2})",
  "digest.title": "📊 Итоги недели ({start} – {end})",
  "settings.lang_set": "Язык установлен: Русский 🇷🇺",
  "doubles.recorded": "✅ Парный матч записан!",
  "tournament.created": "🏆 Турнир \"{name}\" создан! Регистрация: /tournament join",
  "tournament.joined": "✅ {player} в турнире \"{name}\"! ({count} участников)",
  "tournament.started": "🏆 \"{name}\" НАЧАЛСЯ! {players} игроков, {matches} матчей.",
  "tournament.complete": "🏆🏆🏆 ТУРНИР ЗАВЕРШЁН: {name} 🏆🏆🏆",
  "tournament.match_recorded": "🏆 ТУРНИР: {name}",
  "tournament.standings_header": "📊 Таблица:",
  "tournament.remaining": "🏓 Сыграно {played} из {total} матчей",
  "season.new": "🆕 Сезон {name} начался! Рейтинги сброшены до 1000. Поехали! 🏓",
  "season.ended": "🏆 Сезон {name} завершён!"
}
```

### 16.5 LLM Language Handling

The OpenRouter system prompt is extended with a language directive. The language is injected dynamically based on the group/user setting:

```typescript
const systemPrompt = `
${BASE_COMMENTARY_PROMPT}

IMPORTANT: Respond ONLY in ${lang === 'ru' ? 'Russian' : 'English'}.
${lang === 'ru' ? 'Use natural, informal Russian. Avoid transliteration of English slang — use native Russian expressions.' : ''}
`;
```

The LLM handles match commentary, digest narratives, and achievement flavor text. All structured data (ELO numbers, player names, scores) is inserted programmatically, not by the LLM, to avoid translation errors in data.

### 16.6 Adding New Languages

To add a new language:

1. Add a new `{lang}.json` file in both `core/i18n/` and `frontend/src/i18n/`.
2. Add the language code to the allowed values in `/settings lang` and `/lang`.
3. No code changes required — the system picks up new translation files automatically.

### 16.7 Implementation Notes

- Use a lightweight i18n library (e.g. `i18next` for both backend and frontend for consistency).
- All user-facing strings must go through the `t()` function — no hardcoded strings in bot handlers.
- Player names, scores, and ELO numbers are never translated — they pass through as-is.
- Date formatting should respect locale (`DD.MM.YYYY` for Russian, `MMM D, YYYY` for English).

---

## 17. Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | **Score granularity** — set scores vs set count? | Support both. Accept detailed set scores (11-7 11-5) and set count only (2-0). Encourage detailed scores for richer stats. |
| 2 | **Doubles support** | Yes — see Section 9. Full doubles support with team-based ELO. |
| 3 | **Multiple groups** | Build for single group now, but don't hardcode assumptions. `chat_id` on all relevant records. Multi-group support in future. |
| 4 | **ELO reset cadence** | Every ~3 months: Jan 1, Mar 1, Jun 1, Sep 1. ELO resets to 1000 each season. Historical data preserved. See Section 8. |
| 5 | **Privacy** | Unguessable URL slug per group (e.g. `smashrank.app/g/a8f3k2`). No auth required. |
