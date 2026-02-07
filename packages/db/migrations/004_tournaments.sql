-- Tournaments
CREATE TABLE tournaments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- open, active, completed
  created_by      UUID NOT NULL REFERENCES players(id),
  max_players     INTEGER NOT NULL DEFAULT 12,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  CONSTRAINT chk_tournament_status CHECK (status IN ('open', 'active', 'completed'))
);

-- Tournament participants
CREATE TABLE tournament_participants (
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, player_id)
);

-- Tournament standings (one row per participant, updated after each match)
CREATE TABLE tournament_standings (
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  points          INTEGER NOT NULL DEFAULT 0,
  wins            INTEGER NOT NULL DEFAULT 0,
  draws           INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  sets_won        INTEGER NOT NULL DEFAULT 0,
  sets_lost       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, player_id)
);

-- Link matches to tournaments
ALTER TABLE matches ADD COLUMN tournament_id UUID REFERENCES tournaments(id);

-- Seed tournament achievement definitions
INSERT INTO achievement_definitions (id, name, description, emoji) VALUES
  ('tournament_champion',   'Tournament Champion',  'Win a tournament',                   '🏆'),
  ('tournament_undefeated', 'Undefeated',           'Complete a tournament without a loss', '🛡️'),
  ('tournament_ironman',    'Tournament Iron Man',  'Play all fixtures in a tournament',    '⚙️'),
  ('draw_master',           'Draw Master',          'Draw 3+ matches in a single tournament', '🤝');

-- Indexes
CREATE INDEX idx_tournaments_group_id ON tournaments(group_id);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournament_participants_player ON tournament_participants(player_id);
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
