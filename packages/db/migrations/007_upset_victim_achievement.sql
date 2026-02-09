INSERT INTO achievement_definitions (id, name, description, emoji) VALUES
  ('upset_victim', 'Upset Victim', 'Lose to a player 200+ ELO below you', '🤡')
ON CONFLICT (id) DO NOTHING;

-- Fix punching_bag description (was "below", now "above")
UPDATE achievement_definitions
SET description = 'Lose to a player 200+ ELO above you'
WHERE id = 'punching_bag';
