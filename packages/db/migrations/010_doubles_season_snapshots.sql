-- Add doubles columns to season_snapshots
ALTER TABLE season_snapshots
  ADD COLUMN doubles_final_elo INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN doubles_final_rank INTEGER,
  ADD COLUMN doubles_games_played INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN doubles_wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN doubles_losses INTEGER NOT NULL DEFAULT 0;
