ALTER TABLE achievement_definitions
  ADD COLUMN category TEXT NOT NULL DEFAULT 'match',
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'neutral',
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT achievement_definitions_category_check
    CHECK (category IN ('match', 'rating', 'opponents', 'activity', 'doubles', 'tournaments', 'shame', 'meta')),
  ADD CONSTRAINT achievement_definitions_kind_check
    CHECK (kind IN ('positive', 'shame', 'neutral', 'meta'));

ALTER TABLE matches
  ADD COLUMN winner_rank_before INTEGER,
  ADD COLUMN loser_rank_before INTEGER,
  ADD COLUMN winner_rank_after INTEGER,
  ADD COLUMN loser_rank_after INTEGER,
  ADD COLUMN challenge_type TEXT,
  ADD COLUMN challenge_initiator_id UUID REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN challenge_target_rank INTEGER;

ALTER TABLE player_achievements
  ADD COLUMN source_type TEXT,
  ADD COLUMN meta_context JSONB;

UPDATE player_achievements SET source_type = CASE
  WHEN match_id IS NOT NULL THEN 'match'
  WHEN tournament_id IS NOT NULL THEN 'tournament'
  WHEN season_id IS NOT NULL THEN 'season'
  ELSE NULL
END;

ALTER TABLE player_achievements
  ADD CONSTRAINT player_achievements_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('match', 'tournament', 'season', 'meta'));

INSERT INTO achievement_definitions (id, name, description, emoji, category, kind, sort_order) VALUES
  ('first_blood','First Blood','Win your first match','🩸','match','positive',10),
  ('perfect_game','Flawless','Win a set 11-0','✨','match','positive',20),
  ('heartbreaker','Heartbreaker','Win a match after losing the first set','💔','match','positive',30),
  ('stolen_victory','Stolen Victory','Win every winning set by exactly two points','🥷','match','positive',40),
  ('nerves_of_steel','Nerves of Steel','Win a set 20-18 or higher','🧠','match','positive',50),
  ('cardiologist_approved','Cardiologist Approved','Play a match where every set goes beyond 10-10','🫀','match','neutral',60),
  ('groundhog_day','Groundhog Day','Play three consecutive sets with the same normalized score','🔁','match','neutral',70),
  ('rollercoaster','Rollercoaster','Both players win an 11-0 set in one match','🎢','match','neutral',80),
  ('back_from_the_dead','Back from the Dead','Win after losing the first set 0-11','🧟','match','positive',90),
  ('giant_killer','Giant Killer','Beat a player 200+ ELO above you','🗡️','rating','positive',10),
  ('top_dog','Top Dog','Reach rank #1','👑','rating','positive',20),
  ('small_but_nice','Small but Nice','Gain 1 to 3 ELO for a win','🪙','rating','neutral',30),
  ('bully','Bully','Challenge the current #1 and beat them','😈','rating','shame',40),
  ('throne_shaker','Throne Shaker','As #2, beat #1 and take the lead','🫨','rating','positive',50),
  ('throne_defender','Throne Defender','As #1, beat the current #2 three times in a row','🏰','rating','positive',60),
  ('robin_hood','Robin Hood','Beat a higher-rated player and lose to a lower-rated player in one day','🏹','rating','neutral',70),
  ('rivalry','Rival','Play the same opponent 10 times','⚔️','opponents','neutral',10),
  ('boomerang','Boomerang','Alternate winners in five consecutive head-to-head matches','🪃','opponents','neutral',20),
  ('broke_the_wall','Broke the Wall','Beat an opponent after five consecutive losses to them','🧱','opponents','positive',30),
  ('perfect_balance','Perfect Balance','Reach an even head-to-head record after at least ten meetings','⚖️','opponents','neutral',40),
  ('collector','Collector','Beat every active opponent','🗃️','opponents','positive',50),
  ('community_player','Community Player','Play every active opponent','🤝','opponents','neutral',60),
  ('diplomat','Diplomat','Play five different opponents in one Moscow calendar day','🕊️','opponents','neutral',70),
  ('on_fire','On Fire','Win 5 matches in a row','🔥','activity','positive',10),
  ('unstoppable','Unstoppable','Win 10 matches in a row','💀','activity','positive',20),
  ('iron_man','Iron Man','Play 50 matches','🦾','activity','positive',30),
  ('centurion','Centurion','Play 100 matches','💯','activity','positive',40),
  ('comeback_kid','Comeback Kid','Win after losing 3+ matches in a row','🔄','activity','positive',50),
  ('newcomer_threat','Newcomer Threat','Win 5 of your first 10 games','🌟','activity','positive',60),
  ('lunch_break','Lunch Break','Play five matches inside a two-hour window','🥪','activity','neutral',70),
  ('night_shift','Night Shift','Win between 00:00 and 03:59 Moscow time','🌙','activity','neutral',80),
  ('early_bird','Early Bird','Win between 04:00 and 09:59 Moscow time','🐦','activity','positive',90),
  ('no_day_without_ping_pong','No Day Without Ping-Pong','Play on five consecutive Moscow calendar days','📅','activity','positive',100),
  ('stable_instability','Stable Instability','Alternate wins and losses for eight matches','〰️','activity','neutral',110),
  ('lights_out','Lights Out','Play in the group''s final match on five completed days','💡','activity','neutral',120),
  ('well_oiled_pair','Well-Oiled Pair','Win five times with the same partner','⚙️','doubles','positive',10),
  ('social_butterfly','Social Butterfly','Win with five different partners','🦋','doubles','positive',20),
  ('office_divorce','Office Divorce','Beat your partner from your previous doubles match','💔','doubles','neutral',30),
  ('hard_carry','Hard Carry','Win with a partner rated at least 200 ELO below you','🏋️','doubles','positive',40),
  ('pack_hunt','Pack Hunt','Win despite a 200+ combined doubles ELO deficit','🐺','doubles','positive',50),
  ('universal_soldier','Universal Soldier','Partner every active doubles player','🪖','doubles','neutral',60),
  ('shuffle_lineups','Shuffle Lineups','Use three different partners in three consecutive doubles matches','🔀','doubles','neutral',70),
  ('tournament_champion','Tournament Champion','Win a tournament','🏆','tournaments','positive',10),
  ('tournament_undefeated','Undefeated','Complete a tournament without a loss','🛡️','tournaments','positive',20),
  ('tournament_ironman','Tournament Iron Man','Play every fixture in a tournament','🤖','tournaments','positive',30),
  ('draw_master','Draw Master','Draw at least three tournament matches','🤝','tournaments','neutral',40),
  ('clean_sweep','Clean Sweep','Beat every other tournament participant','🧹','tournaments','positive',50),
  ('quiet_start','Quiet Start','Lose your first tournament match, then win the tournament','🤫','tournaments','positive',60),
  ('by_a_whisker','By a Whisker','Win a tournament tied on points with second place','🐱','tournaments','positive',70),
  ('wooden_spoon','Wooden Spoon','Play every fixture and finish last','🥄','tournaments','shame',80),
  ('pacifist','Pacifist','Finish winless with at least three draws','☮️','tournaments','neutral',90),
  ('party_worker','Party Worker','Lead games played at the end of a season','🏭','tournaments','neutral',100),
  ('free_fall','Free Fall','Lose 5 matches in a row','📉','shame','shame',10),
  ('rock_bottom','Rock Bottom','Lose 10 matches in a row','🪨','shame','shame',20),
  ('punching_bag','Punching Bag','Lose to a player 200+ ELO above you','🥊','shame','shame',30),
  ('upset_victim','Upset Victim','Lose to a player 200+ ELO below you','🤡','shame','shame',40),
  ('humbled','Humbled','Lose a set 0-11','😶','shame','shame',50),
  ('bottled_it','Bottled It','Lose after winning the first set','🫣','shame','shame',60),
  ('glass_cannon','Glass Cannon','Win a set 11-0 but lose the match','💥','shame','shame',70),
  ('doormat','Doormat','Lose to the same opponent 5 times in a row','🧽','shame','shame',80),
  ('jackpot','Jackpot','Unlock at least three primary achievements from one match','🎰','meta','meta',10),
  ('full_collection','Full Collection','Complete any non-meta achievement category','🗂️','meta','meta',20),
  ('one_of_a_kind','One of a Kind','Remain the sole holder of an achievement for 30 days','💎','meta','meta',30),
  ('hero_and_villain','Hero and Villain','Unlock a positive and a shame achievement in one match','🎭','meta','meta',40)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  emoji = EXCLUDED.emoji,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE achievement_exclusivity (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
  sole_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  unique_since TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, achievement_id)
);

-- Test/dev databases may replay this migration after dropping tables while retaining functions.
DROP FUNCTION IF EXISTS refresh_achievement_exclusivity(UUID, TEXT);

CREATE OR REPLACE FUNCTION refresh_achievement_exclusivity(
  p_group_id UUID,
  p_achievement_id TEXT,
  p_reset_since BOOLEAN DEFAULT FALSE
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_player_id UUID;
  v_first_unlock TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM groups WHERE id = p_group_id) THEN
    RETURN;
  END IF;
  SELECT COUNT(DISTINCT player_id)::int, MIN(player_id::text)::uuid, MIN(unlocked_at)
    INTO v_count, v_player_id, v_first_unlock
  FROM player_achievements
  WHERE group_id = p_group_id AND achievement_id = p_achievement_id;

  INSERT INTO achievement_exclusivity (
    group_id, achievement_id, sole_player_id, unique_since, updated_at
  ) VALUES (
    p_group_id,
    p_achievement_id,
    CASE WHEN v_count = 1 THEN v_player_id ELSE NULL END,
    CASE WHEN v_count = 1 THEN v_first_unlock ELSE NULL END,
    NOW()
  )
  ON CONFLICT (group_id, achievement_id) DO UPDATE SET
    sole_player_id = EXCLUDED.sole_player_id,
    unique_since = CASE
      WHEN achievement_exclusivity.sole_player_id = EXCLUDED.sole_player_id
        THEN achievement_exclusivity.unique_since
      WHEN EXCLUDED.sole_player_id IS NOT NULL AND p_reset_since
        THEN NOW()
      ELSE EXCLUDED.unique_since
    END,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION player_achievement_exclusivity_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.group_id IS NOT NULL THEN
      PERFORM refresh_achievement_exclusivity(OLD.group_id, OLD.achievement_id, TRUE);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.group_id IS NOT NULL THEN
    PERFORM refresh_achievement_exclusivity(NEW.group_id, NEW.achievement_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER player_achievement_exclusivity_after_change
AFTER INSERT OR DELETE ON player_achievements
FOR EACH ROW EXECUTE FUNCTION player_achievement_exclusivity_trigger();

CREATE OR REPLACE FUNCTION award_achievements(
  p_group_id UUID,
  p_awards JSONB,
  p_source_type TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_meta_context JSONB DEFAULT NULL,
  p_unlocked_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS SETOF player_achievements LANGUAGE plpgsql AS $$
DECLARE
  v_item RECORD;
  v_award player_achievements%ROWTYPE;
BEGIN
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_awards, '[]'::jsonb))
      AS item(player_id UUID, achievement_id TEXT)
    ORDER BY achievement_id, player_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text), hashtext(v_item.achievement_id));
    v_award := NULL;
    INSERT INTO player_achievements (
      group_id, player_id, achievement_id,
      match_id, tournament_id, season_id,
      source_type, meta_context, unlocked_at
    ) VALUES (
      p_group_id, v_item.player_id, v_item.achievement_id,
      CASE WHEN p_source_type = 'match' THEN p_source_id ELSE NULL END,
      CASE WHEN p_source_type = 'tournament' THEN p_source_id ELSE NULL END,
      CASE WHEN p_source_type = 'season' THEN p_source_id ELSE NULL END,
      p_source_type, p_meta_context, p_unlocked_at
    )
    ON CONFLICT (group_id, player_id, achievement_id) WHERE group_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_award;

    IF v_award.id IS NOT NULL THEN
      PERFORM refresh_achievement_exclusivity(p_group_id, v_item.achievement_id);
      RETURN NEXT v_award;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION delete_achievements_by_match(p_match_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_group_id UUID;
  v_achievement_id TEXT;
  v_deleted INTEGER := 0;
  v_row_count INTEGER;
BEGIN
  FOR v_group_id, v_achievement_id IN
    SELECT DISTINCT group_id, achievement_id
    FROM player_achievements
    WHERE match_id = p_match_id OR meta_context->>'match_id' = p_match_id::text
  LOOP
    DELETE FROM player_achievements
    WHERE group_id = v_group_id
      AND achievement_id = v_achievement_id
      AND (match_id = p_match_id OR meta_context->>'match_id' = p_match_id::text);
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_deleted := v_deleted + v_row_count;
    PERFORM refresh_achievement_exclusivity(v_group_id, v_achievement_id);
  END LOOP;
  RETURN v_deleted;
END;
$$;

INSERT INTO achievement_exclusivity (group_id, achievement_id, sole_player_id, unique_since)
SELECT
  group_id,
  achievement_id,
  CASE WHEN COUNT(DISTINCT player_id) = 1 THEN MIN(player_id::text)::uuid ELSE NULL END,
  CASE WHEN COUNT(DISTINCT player_id) = 1 THEN MIN(unlocked_at) ELSE NULL END
FROM player_achievements
WHERE group_id IS NOT NULL
GROUP BY group_id, achievement_id
ON CONFLICT (group_id, achievement_id) DO NOTHING;

CREATE INDEX idx_achievement_exclusivity_maturing
  ON achievement_exclusivity (unique_since)
  WHERE sole_player_id IS NOT NULL;

CREATE INDEX idx_matches_group_played_at_desc
  ON matches (group_id, played_at DESC);
