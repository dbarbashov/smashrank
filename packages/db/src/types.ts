export interface Player {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  display_name: string;
  registered_at: Date;
  last_active: Date | null;
  language: string;
  avatar_file_id: string | null;
  avatar_updated_at: Date | null;
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
  elo_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
  doubles_elo_rating: number;
  doubles_games_played: number;
  doubles_wins: number;
  doubles_losses: number;
  doubles_current_streak: number;
  doubles_best_streak: number;
  sets_played: number;
}

export interface GroupMemberWithPlayer extends GroupMember {
  display_name: string;
  telegram_username: string | null;
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
  tournament_id: string | null;
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
  doubles_final_elo: number;
  doubles_final_rank: number | null;
  doubles_games_played: number;
  doubles_wins: number;
  doubles_losses: number;
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

export interface Tournament {
  id: string;
  group_id: string;
  name: string;
  status: "open" | "active" | "completed";
  created_by: string;
  max_players: number;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface TournamentParticipant {
  tournament_id: string;
  player_id: string;
  joined_at: Date;
}

export interface TournamentStanding {
  tournament_id: string;
  player_id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
}
