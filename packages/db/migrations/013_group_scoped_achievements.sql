-- Scope achievement unlocks to the group where they happened and retain
-- enough source information to explain tournament and season unlocks.
ALTER TABLE player_achievements
  ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  ADD COLUMN season_id UUID REFERENCES seasons(id) ON DELETE SET NULL;

-- Match-backed unlocks can be attributed exactly.
UPDATE player_achievements pa
SET group_id = m.group_id
FROM matches m
WHERE pa.match_id = m.id;

-- Source-less legacy unlocks are only safe to attribute when the player has
-- belonged to exactly one group. Ambiguous rows remain intentionally unscoped.
WITH single_group_memberships AS (
  SELECT player_id, MIN(group_id::text)::uuid AS group_id
  FROM group_members
  GROUP BY player_id
  HAVING COUNT(*) = 1
)
UPDATE player_achievements pa
SET group_id = membership.group_id
FROM single_group_memberships membership
WHERE pa.player_id = membership.player_id
  AND pa.group_id IS NULL;

-- Keep source attribution unambiguous and within the same group. The
-- redundant unique constraints allow composite foreign keys to enforce the
-- group relationship declaratively.
ALTER TABLE matches
  ADD CONSTRAINT matches_id_group_id_key UNIQUE (id, group_id);

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_id_group_id_key UNIQUE (id, group_id);

ALTER TABLE seasons
  ADD CONSTRAINT seasons_id_group_id_key UNIQUE (id, group_id);

ALTER TABLE player_achievements
  ADD CONSTRAINT player_achievements_single_source_check
    CHECK (num_nonnulls(match_id, tournament_id, season_id) <= 1),
  ADD CONSTRAINT player_achievements_match_group_fk
    FOREIGN KEY (match_id, group_id) REFERENCES matches(id, group_id),
  ADD CONSTRAINT player_achievements_tournament_group_fk
    FOREIGN KEY (tournament_id, group_id) REFERENCES tournaments(id, group_id),
  ADD CONSTRAINT player_achievements_season_group_fk
    FOREIGN KEY (season_id, group_id) REFERENCES seasons(id, group_id);

ALTER TABLE player_achievements
  DROP CONSTRAINT IF EXISTS player_achievements_player_id_achievement_id_key;

CREATE UNIQUE INDEX idx_player_achievements_group_unique
  ON player_achievements (group_id, player_id, achievement_id)
  WHERE group_id IS NOT NULL;

CREATE UNIQUE INDEX idx_player_achievements_legacy_unique
  ON player_achievements (player_id, achievement_id)
  WHERE group_id IS NULL;

CREATE INDEX idx_player_achievements_group_achievement
  ON player_achievements (group_id, achievement_id, unlocked_at DESC);
