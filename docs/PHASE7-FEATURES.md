# Phase 7 — Feature Roadmap

**Date:** February 2026
**Status:** Planned

These features were selected after analyzing the design doc and current codebase (Phases 1-6 complete, 228 tests, 9 migrations).

---

## Feature List

### 7.1 Rematch Prompt
**Priority:** High | **Effort:** Low

After a match is logged, show the loser a "Rematch?" inline button. If tapped, auto-creates a challenge session (reuses existing challenge state machine: PENDING → WHO_WON → SCORE_ENTRY).

**Implementation notes:**
- Add inline keyboard button to match result message (only for loser)
- Callback prefix: `rm:` (rematch)
- Tapping creates a challenge session between same players
- Reuse `ChallengeSession` from challenge system
- i18n: `rematch.prompt`, `rematch.accepted`, `rematch.declined`
- Group setting: `rematch_prompt` (on/off, default on)

---

### 7.2 ELO Sparklines on Web Leaderboard
**Priority:** High | **Effort:** Low

Design doc section 11.1 specifies "ELO sparkline per player (last 20 games)" on the web leaderboard page. Currently missing.

**Implementation notes:**
- Extend leaderboard API to include last 20 ELO datapoints per player (or fetch separately)
- Use a lightweight sparkline component (recharts `<Sparkline>` or inline SVG)
- Show as a small inline chart next to each player row
- Color: green if net positive, red if net negative over the window

---

### 7.3 Prediction Game for Challenges
**Priority:** High | **Effort:** Medium

When a challenge is issued, group members can predict the winner via inline buttons. Track prediction accuracy per player.

**Implementation notes:**
- When challenge enters PENDING state, post prediction buttons: "[Player A] / [Player B]"
- Store predictions: new `challenge_predictions` table (`challenge_key`, `predictor_id`, `predicted_winner_id`, `correct BOOLEAN`)
- After match resolves, update `correct` column and announce top predictor stats
- `/predictions` command — show personal prediction accuracy and leaderboard
- New achievement: `oracle` — 10 correct predictions in a row
- Web: prediction leaderboard on group page
- i18n: `prediction.prompt`, `prediction.correct`, `prediction.wrong`, `prediction.leaderboard`

**DB migration:**
```sql
CREATE TABLE challenge_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id),
  challenge_key TEXT NOT NULL,           -- groupId:player1:player2
  predictor_id UUID NOT NULL REFERENCES players(id),
  predicted_winner_id UUID NOT NULL REFERENCES players(id),
  actual_winner_id UUID REFERENCES players(id),  -- NULL until resolved
  correct BOOLEAN,                                -- NULL until resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(challenge_key, predictor_id)
);
```

---

### 7.4 Milestones & Records Board
**Priority:** High | **Effort:** Medium

Track group records: highest ELO ever, longest win streak, biggest upset, most matches in a day, fastest ELO climb. `/records` command + web page.

**Implementation notes:**
- Records can be derived from existing data (no new table needed, just queries):
  - Highest ELO ever reached: `MAX(elo_before_winner + elo_change)` from matches or track on group_members
  - Longest win streak: `MAX(best_streak)` across all group_members
  - Biggest upset: match with largest ELO gap where lower-rated player won
  - Most matches in one day: `COUNT(*) GROUP BY DATE(played_at)` per player
  - Fastest to 1200/1300/1400 ELO: fewest games to reach threshold
- `/records` bot command — show top records with holders
- Web page: `/g/:slug/records` — full records board with dates
- When a record is broken, announce in group chat with LLM commentary
- i18n: `records.title`, `records.highest_elo`, `records.longest_streak`, etc.

---

### 7.5 Match Confirmation
**Priority:** Medium | **Effort:** Medium

Require the opponent to confirm a logged match before it counts. Prevents one-sided reporting mistakes.

**Implementation notes:**
- **Group setting:** `match_confirmation` (on/off, default off) — since groups are small (~12 people), this is opt-in
- When enabled, match is logged as `status = 'pending'` instead of immediately applied
- Opponent gets inline buttons: "Confirm ✅ / Dispute ❌"
- On confirm: apply ELO, streaks, achievements (same as current flow)
- On dispute: delete pending match, notify reporter
- Auto-confirm after 1 hour (configurable?) if opponent doesn't respond
- Callback prefix: `mc:` (match confirm)
- Pending matches shown differently on leaderboard (or not shown until confirmed)

**DB change:**
- Add `status TEXT NOT NULL DEFAULT 'confirmed'` to matches table (values: 'pending', 'confirmed', 'disputed')
- Or: simpler approach — hold match data in memory (like challenges) until confirmed, never persist pending matches

---

### 7.6 Rating Bands / Tiers
**Priority:** Medium | **Effort:** Low

Assign tier names based on ELO. Show tier badges everywhere.

**Tier definitions:**
| Tier | ELO Range | Badge |
|------|-----------|-------|
| Bronze | < 900 | 🥉 |
| Silver | 900–1099 | 🥈 |
| Gold | 1100–1299 | 🥇 |
| Platinum | 1300–1499 | 💎 |
| Diamond | 1500+ | 👑 |

**Implementation notes:**
- Pure display logic — `getTier(elo): { name, emoji, color }` in core
- Show tier badge on: leaderboard, stats, match results, web profiles
- Tier-up/tier-down announcements in match commentary (add to LLM context)
- Achievement: `promoted` — reach Gold tier for the first time
- i18n: `tier.bronze`, `tier.silver`, `tier.gold`, `tier.platinum`, `tier.diamond`
- Web: colored tier badges with CSS

---

### 7.7 Activity Decay / Inactive Flag
**Priority:** Medium | **Effort:** Low

Players inactive for 14+ days shown as "inactive" on leaderboard. Optional ELO decay.

**Implementation notes:**
- Track `last_active` on group_members (already exists as `last_active` on players table — may need per-group tracking)
- After 14 days of no matches: grey out on leaderboard, show "inactive" badge
- Optional decay: -5 ELO/week after 2 weeks idle (group setting: `elo_decay` on/off, default off)
- Decay applied by scheduler (already runs every 60s)
- When player returns, remove inactive flag on next match
- Web: inactive players shown at bottom of leaderboard with muted styling
- i18n: `decay.inactive`, `decay.returned`

---

### 7.8 Season Awards Ceremony
**Priority:** High | **Effort:** Medium

At season end, auto-generate awards with LLM commentary.

**Awards:**
| Award | Criteria |
|-------|----------|
| MVP | Highest final ELO |
| Most Improved | Biggest ELO gain from 1000 |
| Iron Man | Most matches played |
| Giant Killer | Most wins against higher-rated opponents |
| Streaker | Longest win streak during season |
| Best Doubles Partner | Pair with highest combined doubles win rate |
| Comeback King | Most wins after being on a losing streak |
| Consistency Award | Lowest ELO variance (standard deviation) |

**Implementation notes:**
- Computed at season end from existing match/stats data
- New `season_awards` table or just derive at query time
- LLM generates "awards ceremony" narrative (longer format, ~500 tokens — use better model)
- Bot posts awards ceremony message to group
- Web: awards displayed on season detail page
- Achievements: `season_mvp`, `most_improved` — earned by winning these awards
- i18n: `awards.title`, `awards.mvp`, `awards.most_improved`, etc.

---

### 7.9 Group Activity Heatmap
**Priority:** Medium | **Effort:** Medium

GitHub-style contribution heatmap showing matches per day. Available for group level and per player.

**Implementation notes:**
- New API endpoints:
  - `GET /api/g/:slug/activity` — group-level daily match counts (last 365 days)
  - `GET /api/g/:slug/players/:id/activity` — per-player daily match counts
- Query: `SELECT DATE(played_at) as date, COUNT(*) as count FROM matches WHERE group_id = $1 GROUP BY DATE(played_at)`
- Web component: heatmap grid (52 weeks x 7 days), color intensity by match count
- Show on: group home page (below leaderboard) and player profile page
- Bot: no bot command needed (visual feature, web-only)
- Use CSS grid or lightweight heatmap library

---

## Implementation Order (Suggested)

Grouped by dependency and effort for efficient batching:

**Batch 1 — Display-layer features (no schema changes):**
1. Rating Bands / Tiers (7.6)
2. ELO Sparklines (7.2)
3. Activity Decay / Inactive Flag (7.7)
4. Group Activity Heatmap (7.9)

**Batch 2 — Gameplay enhancements (light schema changes):**
5. Rematch Prompt (7.1)
6. Match Confirmation (7.5)
7. Milestones & Records Board (7.4)

**Batch 3 — New systems:**
8. Prediction Game (7.3)
9. Season Awards Ceremony (7.8)

---

## New Achievements (Phase 7)

| ID | Name | Emoji | Condition |
|----|------|-------|-----------|
| `oracle` | Oracle | 🔮 | 10 correct challenge predictions in a row |
| `promoted_gold` | Gold Tier | 🥇 | Reach Gold tier (1100 ELO) |
| `promoted_platinum` | Platinum | 💎 | Reach Platinum tier (1300 ELO) |
| `promoted_diamond` | Diamond | 👑 | Reach Diamond tier (1500 ELO) |
| `season_mvp` | Season MVP | 🏆 | Win the MVP award at season end |
| `most_improved` | Most Improved | 📈 | Win the Most Improved award at season end |
| `revenge` | Revenge | 🔄 | Win a rematch within 10 minutes of losing |

---

## New Group Settings (Phase 7)

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `rematch_prompt` | on/off | on | Show rematch button after matches |
| `match_confirmation` | on/off | off | Require opponent confirmation |
| `elo_decay` | on/off | off | -5 ELO/week after 14 days inactive |
| `predictions` | on/off | on | Enable prediction game for challenges |
