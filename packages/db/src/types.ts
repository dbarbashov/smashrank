export interface Player {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  display_name: string;
  elo_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
  registered_at: Date;
  last_active: Date | null;
  language: string;
}

export interface Group {
  id: string;
  chat_id: number;
  name: string | null;
  slug: string;
  language: string;
  settings: Record<string, unknown>;
  created_at: Date;
}

export interface GroupMember {
  group_id: string;
  player_id: string;
  joined_at: Date;
}

export interface Season {
  id: string;
  group_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: Date;
}

export interface Match {
  id: string;
  match_type: string;
  season_id: string;
  group_id: string;
  winner_id: string;
  loser_id: string;
  winner_score: number;
  loser_score: number;
  set_scores: { w: number; l: number }[] | null;
  winner_partner_id: string | null;
  loser_partner_id: string | null;
  elo_before_winner_partner: number | null;
  elo_before_loser_partner: number | null;
  elo_before_winner: number;
  elo_before_loser: number;
  elo_change: number;
  reported_by: string;
  played_at: Date;
}

export interface SeasonSnapshot {
  id: string;
  season_id: string;
  player_id: string;
  final_elo: number;
  final_rank: number;
  games_played: number;
  wins: number;
  losses: number;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

export interface PlayerAchievement {
  id: string;
  player_id: string;
  achievement_id: string;
  match_id: string | null;
  unlocked_at: Date;
}
