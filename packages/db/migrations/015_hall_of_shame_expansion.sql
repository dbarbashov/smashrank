ALTER TABLE achievement_definitions
  ADD COLUMN eligible_from TIMESTAMPTZ;

INSERT INTO achievement_definitions (
  id, name, description, emoji, category, kind, sort_order, eligible_from
) VALUES
  ('abyss', 'Abyss', 'Lose 15 matches in a row', '🕳️', 'shame', 'shame', 90, CURRENT_TIMESTAMP),
  ('regular_customer', 'Regular Customer', 'Lose to the same opponent 3 times in a row', '🧾', 'shame', 'shame', 100, CURRENT_TIMESTAMP),
  ('shut_out', 'Shut Out', 'Lose a match without winning a set', '🏳️', 'shame', 'shame', 110, CURRENT_TIMESTAMP),
  ('demolition', 'Demolition', 'Score no more than 5 points in every set of a lost match', '🧨', 'shame', 'shame', 120, CURRENT_TIMESTAMP),
  ('almost', 'Almost', 'Lose the deciding third set 10-12', '🤏', 'shame', 'shame', 130, CURRENT_TIMESTAMP),
  ('double_zero', 'Double Zero', 'Lose two sets 0-11 in one match', '0️⃣', 'shame', 'shame', 140, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  emoji = EXCLUDED.emoji,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  sort_order = EXCLUDED.sort_order,
  eligible_from = COALESCE(achievement_definitions.eligible_from, EXCLUDED.eligible_from);

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
    IF NOT EXISTS (
      SELECT 1
      FROM achievement_definitions
      WHERE id = v_item.achievement_id
        AND (eligible_from IS NULL OR p_unlocked_at >= eligible_from)
    ) THEN
      CONTINUE;
    END IF;

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
