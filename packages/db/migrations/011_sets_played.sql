ALTER TABLE group_members ADD COLUMN sets_played INTEGER NOT NULL DEFAULT 0;

INSERT INTO achievement_definitions (id, name, description, emoji)
VALUES ('party_worker', 'Party Worker', 'Be #1 in total games played at end of season', '🏭')
ON CONFLICT DO NOTHING;
