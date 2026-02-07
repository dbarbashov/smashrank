export interface GroupInfo {
  name: string;
  slug: string;
  language: string;
}

export interface LeaderboardEntry {
  id: string;
  display_name: string;
  telegram_username?: string | null;
  elo_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
}

export interface PlayerProfile {
  id: string;
  telegram_id: string;
  telegram_username: string | null;
  display_name: string;
  elo_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
  rank: number | null;
  total_in_group: number;
  achievement_count: number;
}

export interface EloHistoryEntry {
  match_id: string;
  elo_after: number;
  played_at: string;
}

export interface Match {
  id: string;
  match_type: string;
  winner_id: string;
  loser_id: string;
  winner_score: number | null;
  loser_score: number | null;
  set_scores: { w: number; l: number }[] | null;
  winner_partner_id: string | null;
  loser_partner_id: string | null;
  elo_before_winner: number;
  elo_before_loser: number;
  elo_change: number;
  played_at: string;
  winner_name: string;
  loser_name: string;
  winner_partner_name?: string | null;
  loser_partner_name?: string | null;
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
  unlocked_at: string;
  name: string;
  description: string;
  emoji: string;
}

export interface RecentAchievement {
  id: string;
  player_id: string;
  achievement_id: string;
  unlocked_at: string;
  display_name: string;
  name: string;
  description: string;
  emoji: string;
}

export interface Season {
  id: string;
  group_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SeasonSnapshot {
  player_id: string;
  display_name: string;
  final_elo: number;
  final_rank: number;
  games_played: number;
  wins: number;
  losses: number;
}

export interface SeasonDetail extends Season {
  standings: SeasonSnapshot[];
}

export interface WeeklyStats {
  total_matches: number;
  active_players: number;
  biggest_upset: Match | null;
  top_winner: { display_name: string; wins: number } | null;
}

export interface TournamentSummary {
  id: string;
  group_id: string;
  name: string;
  status: "open" | "active" | "completed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  participant_count: number;
}

export interface TournamentStanding {
  rank: number;
  player_id: string;
  display_name: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  set_diff: number;
}

export interface TournamentFixture {
  player1_id: string;
  player1_name: string;
  player2_id: string;
  player2_name: string;
  played: boolean;
  winner_id: string | null;
  winner_score: number | null;
  loser_score: number | null;
  is_draw: boolean;
}

export interface TournamentDetail {
  id: string;
  group_id: string;
  name: string;
  status: "open" | "active" | "completed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  participants: { player_id: string; display_name: string; elo_rating: number }[];
  standings: TournamentStanding[];
  fixtures: TournamentFixture[];
}
