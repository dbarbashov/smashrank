ALTER TABLE matches ADD COLUMN winner_partner_id UUID REFERENCES players(id);
ALTER TABLE matches ADD COLUMN loser_partner_id UUID REFERENCES players(id);
ALTER TABLE matches ADD COLUMN elo_before_winner_partner INTEGER;
ALTER TABLE matches ADD COLUMN elo_before_loser_partner INTEGER;
