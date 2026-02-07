import type { SqlLike } from "../sql-type.js";

export interface WeeklyStats {
  matchCount: number;
  mostActive: { name: string; count: number } | null;
  biggestGainer: { name: string; change: number } | null;
  biggestLoser: { name: string; change: number } | null;
  longestStreak: { name: string; streak: number } | null;
  newAchievements: { playerName: string; achievementName: string; emoji: string }[];
}

export function digestQueries(sql: SqlLike) {
  return {
    async getWeeklyStats(groupId: string, since: Date): Promise<WeeklyStats> {
      // Match count
      const countRows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM matches
        WHERE group_id = ${groupId} AND played_at >= ${since}
      `;
      const matchCount = parseInt(countRows[0].count, 10);

      if (matchCount === 0) {
        return {
          matchCount: 0,
          mostActive: null,
          biggestGainer: null,
          biggestLoser: null,
          longestStreak: null,
          newAchievements: [],
        };
      }

      // Most active player
      const activeRows = await sql<{ name: string; count: string }[]>`
        SELECT p.display_name AS name, COUNT(*)::text AS count
        FROM (
          SELECT winner_id AS player_id FROM matches WHERE group_id = ${groupId} AND played_at >= ${since}
          UNION ALL
          SELECT loser_id AS player_id FROM matches WHERE group_id = ${groupId} AND played_at >= ${since}
        ) sub
        JOIN players p ON p.id = sub.player_id
        GROUP BY p.display_name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `;

      // Biggest gainer / loser (net ELO change)
      const eloRows = await sql<{ name: string; net_change: string }[]>`
        SELECT p.display_name AS name, SUM(
          CASE WHEN m.winner_id = p.id THEN m.elo_change ELSE -m.elo_change END
        )::text AS net_change
        FROM matches m
        JOIN players p ON p.id = m.winner_id OR p.id = m.loser_id
        WHERE m.group_id = ${groupId} AND m.played_at >= ${since}
          AND (m.winner_id = p.id OR m.loser_id = p.id)
        GROUP BY p.id, p.display_name
        ORDER BY SUM(CASE WHEN m.winner_id = p.id THEN m.elo_change ELSE -m.elo_change END) DESC
      `;

      // Longest win streak within the period
      const streakRows = await sql<{ winner_id: string; loser_id: string; played_at: Date }[]>`
        SELECT winner_id, loser_id, played_at FROM matches
        WHERE group_id = ${groupId} AND played_at >= ${since}
        ORDER BY played_at ASC
      `;

      // Calculate streaks per player
      const streaks = new Map<string, { current: number; best: number }>();
      for (const row of streakRows) {
        for (const pid of [row.winner_id, row.loser_id]) {
          if (!streaks.has(pid)) streaks.set(pid, { current: 0, best: 0 });
          const s = streaks.get(pid)!;
          if (pid === row.winner_id) {
            s.current = s.current > 0 ? s.current + 1 : 1;
          } else {
            s.current = 0;
          }
          s.best = Math.max(s.best, s.current);
        }
      }

      let longestStreak: { playerId: string; streak: number } | null = null;
      for (const [pid, s] of streaks) {
        if (!longestStreak || s.best > longestStreak.streak) {
          longestStreak = { playerId: pid, streak: s.best };
        }
      }

      let longestStreakResult: { name: string; streak: number } | null = null;
      if (longestStreak && longestStreak.streak >= 2) {
        const nameRows = await sql<{ display_name: string }[]>`
          SELECT display_name FROM players WHERE id = ${longestStreak.playerId}
        `;
        if (nameRows[0]) {
          longestStreakResult = { name: nameRows[0].display_name, streak: longestStreak.streak };
        }
      }

      // New achievements
      const achievementRows = await sql<{ player_name: string; achievement_name: string; emoji: string }[]>`
        SELECT p.display_name AS player_name, ad.name AS achievement_name, ad.emoji
        FROM player_achievements pa
        JOIN players p ON p.id = pa.player_id
        JOIN achievement_definitions ad ON ad.id = pa.achievement_id
        JOIN matches m ON m.id = pa.match_id
        WHERE m.group_id = ${groupId} AND pa.unlocked_at >= ${since}
        ORDER BY pa.unlocked_at ASC
      `;

      return {
        matchCount,
        mostActive: activeRows[0]
          ? { name: activeRows[0].name, count: parseInt(activeRows[0].count, 10) }
          : null,
        biggestGainer: eloRows[0]
          ? { name: eloRows[0].name, change: parseInt(eloRows[0].net_change, 10) }
          : null,
        biggestLoser: eloRows.length > 0
          ? {
              name: eloRows[eloRows.length - 1].name,
              change: parseInt(eloRows[eloRows.length - 1].net_change, 10),
            }
          : null,
        longestStreak: longestStreakResult,
        newAchievements: achievementRows.map((r) => ({
          playerName: r.player_name,
          achievementName: r.achievement_name,
          emoji: r.emoji,
        })),
      };
    },
  };
}
