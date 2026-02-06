CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  display_name  TEXT NOT NULL,
  elo_rating    INTEGER NOT NULL DEFAULT 1000,
  games_played  INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak   INTEGER NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active   TIMESTAMPTZ,
  language      TEXT NOT NULL DEFAULT 'en'
);

CREATE TABLE groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       BIGINT UNIQUE NOT NULL,
  name          TEXT,
  slug          TEXT UNIQUE NOT NULL,
  language      TEXT NOT NULL DEFAULT 'en',
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, player_id)
);

CREATE TABLE seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type          TEXT NOT NULL DEFAULT 'singles',
  season_id           UUID NOT NULL REFERENCES seasons(id),
  group_id            UUID NOT NULL REFERENCES groups(id),
  winner_id           UUID NOT NULL REFERENCES players(id),
  loser_id            UUID NOT NULL REFERENCES players(id),
  winner_score        INTEGER NOT NULL,
  loser_score         INTEGER NOT NULL,
  set_scores          JSONB,
  elo_before_winner   INTEGER NOT NULL,
  elo_before_loser    INTEGER NOT NULL,
  elo_change          INTEGER NOT NULL,
  reported_by         UUID NOT NULL REFERENCES players(id),
  played_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE season_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     UUID NOT NULL REFERENCES seasons(id),
  player_id     UUID NOT NULL REFERENCES players(id),
  final_elo     INTEGER NOT NULL,
  final_rank    INTEGER NOT NULL,
  games_played  INTEGER NOT NULL,
  wins          INTEGER NOT NULL,
  losses        INTEGER NOT NULL,
  UNIQUE(season_id, player_id)
);

CREATE TABLE achievement_definitions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '🏅'
);

CREATE TABLE player_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID NOT NULL REFERENCES players(id),
  achievement_id TEXT NOT NULL REFERENCES achievement_definitions(id),
  match_id       UUID REFERENCES matches(id),
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, achievement_id)
);

CREATE INDEX idx_matches_group_id ON matches(group_id);
CREATE INDEX idx_matches_season_id ON matches(season_id);
CREATE INDEX idx_matches_winner_id ON matches(winner_id);
CREATE INDEX idx_matches_loser_id ON matches(loser_id);
CREATE INDEX idx_matches_played_at ON matches(played_at);
CREATE INDEX idx_seasons_group_active ON seasons(group_id, is_active);
CREATE INDEX idx_group_members_player ON group_members(player_id);
