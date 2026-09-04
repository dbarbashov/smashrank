export interface WeeklyStats {
  matchCount: number;
  mostActive: { playerId: string; name: string; count: number } | null;
  biggestGainer: { playerId: string; name: string; change: number } | null;
  biggestLoser: { playerId: string; name: string; change: number } | null;
  longestStreak: { playerId: string; name: string; streak: number } | null;
  newAchievements: {
    playerId: string;
    playerName: string;
    achievementName: string;
    emoji: string;
  }[];
}
