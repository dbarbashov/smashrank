-- Migration: Move stat columns from players to group_members for per-group isolation

-- 1. Add stat columns to group_members
ALTER TABLE group_members
  ADD COLUMN elo_rating REAL NOT NULL DEFAULT 1200,
  ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN losses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0;

-- 2. Backfill from players (copy global stats to each group membership)
UPDATE group_members gm SET
  elo_rating = p.elo_rating,
  games_played = p.games_played,
  wins = p.wins,
  losses = p.losses,
  current_streak = p.current_streak,
  best_streak = p.best_streak
FROM players p
WHERE p.id = gm.player_id;

-- 3. Drop stat columns from players
ALTER TABLE players
  DROP COLUMN elo_rating,
  DROP COLUMN games_played,
  DROP COLUMN wins,
  DROP COLUMN losses,
  DROP COLUMN current_streak,
  DROP COLUMN best_streak;
