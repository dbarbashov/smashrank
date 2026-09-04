import type { SqlLike } from "../sql-type.js";
import type { WeeklyStats } from "@smashrank/core";

export type { WeeklyStats } from "@smashrank/core";

export function digestQueries(sql: SqlLike) {
  return {
    async getWeeklyStats(
      groupId: string,
      since: Date,
      matchType?: string,
    ): Promise<WeeklyStats> {
      // Match count
      const countRows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM matches m
        WHERE m.group_id = ${groupId}
          AND m.played_at >= ${since}
          AND (${matchType ?? null}::text IS NULL OR m.match_type = ${matchType ?? null})
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
      const activeRows = await sql<{ player_id: string; name: string; count: string }[]>`
        WITH filtered_matches AS (
          SELECT winner_id, loser_id, winner_partner_id, loser_partner_id
          FROM matches m
          WHERE m.group_id = ${groupId}
            AND m.played_at >= ${since}
            AND (${matchType ?? null}::text IS NULL OR m.match_type = ${matchType ?? null})
        ), participants AS (
          SELECT winner_id AS player_id FROM filtered_matches
          UNION ALL
          SELECT loser_id AS player_id FROM filtered_matches
          UNION ALL
          SELECT winner_partner_id AS player_id FROM filtered_matches
          WHERE winner_partner_id IS NOT NULL
          UNION ALL
          SELECT loser_partner_id AS player_id FROM filtered_matches
          WHERE loser_partner_id IS NOT NULL
        )
        SELECT p.id AS player_id, p.display_name AS name, COUNT(*)::text AS count
        FROM participants
        JOIN players p ON p.id = participants.player_id
        GROUP BY p.id, p.display_name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `;

      // Biggest gainer / loser (net ELO change)
      const eloRows = await sql<{ player_id: string; name: string; net_change: string }[]>`
        WITH filtered_matches AS (
          SELECT winner_id, loser_id, winner_partner_id, loser_partner_id, elo_change
          FROM matches m
          WHERE m.group_id = ${groupId}
            AND m.played_at >= ${since}
            AND (${matchType ?? null}::text IS NULL OR m.match_type = ${matchType ?? null})
        ), changes AS (
          SELECT winner_id AS player_id, elo_change FROM filtered_matches
          UNION ALL
          SELECT loser_id AS player_id, -elo_change AS elo_change FROM filtered_matches
          UNION ALL
          SELECT winner_partner_id AS player_id, elo_change FROM filtered_matches
          WHERE winner_partner_id IS NOT NULL
          UNION ALL
          SELECT loser_partner_id AS player_id, -elo_change AS elo_change
          FROM filtered_matches
          WHERE loser_partner_id IS NOT NULL
        )
        SELECT p.id AS player_id, p.display_name AS name,
          SUM(changes.elo_change)::text AS net_change
        FROM changes
        JOIN players p ON p.id = changes.player_id
        GROUP BY p.id, p.display_name
        ORDER BY SUM(changes.elo_change) DESC
      `;

      // Longest win streak within the period
      const streakRows = await sql<{
        winner_id: string;
        loser_id: string;
        winner_partner_id: string | null;
        loser_partner_id: string | null;
        played_at: Date;
      }[]>`
        SELECT winner_id, loser_id, winner_partner_id, loser_partner_id, played_at
        FROM matches m
        WHERE m.group_id = ${groupId}
          AND m.played_at >= ${since}
          AND (${matchType ?? null}::text IS NULL OR m.match_type = ${matchType ?? null})
        ORDER BY m.played_at ASC
      `;

      // Calculate streaks per player
      const streaks = new Map<string, { current: number; best: number }>();
      for (const row of streakRows) {
        const winners = [row.winner_id, row.winner_partner_id].filter(
          (playerId): playerId is string => playerId !== null,
        );
        const losers = [row.loser_id, row.loser_partner_id].filter(
          (playerId): playerId is string => playerId !== null,
        );

        for (const pid of [...winners, ...losers]) {
          if (!streaks.has(pid)) streaks.set(pid, { current: 0, best: 0 });
          const s = streaks.get(pid)!;
          if (winners.includes(pid)) {
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

      let longestStreakResult: WeeklyStats["longestStreak"] = null;
      if (longestStreak && longestStreak.streak >= 2) {
        const nameRows = await sql<{ display_name: string }[]>`
          SELECT display_name FROM players WHERE id = ${longestStreak.playerId}
        `;
        if (nameRows[0]) {
          longestStreakResult = {
            playerId: longestStreak.playerId,
            name: nameRows[0].display_name,
            streak: longestStreak.streak,
          };
        }
      }

      // New achievements
      const achievementRows = await sql<{
        player_id: string;
        player_name: string;
        achievement_name: string;
        emoji: string;
      }[]>`
        SELECT p.id AS player_id, p.display_name AS player_name,
          ad.name AS achievement_name, ad.emoji
        FROM player_achievements pa
        JOIN players p ON p.id = pa.player_id
        JOIN achievement_definitions ad ON ad.id = pa.achievement_id
        JOIN matches m ON m.id = pa.match_id
        WHERE m.group_id = ${groupId}
          AND pa.unlocked_at >= ${since}
          AND (${matchType ?? null}::text IS NULL OR m.match_type = ${matchType ?? null})
        ORDER BY pa.unlocked_at ASC
      `;

      return {
        matchCount,
        mostActive: activeRows[0]
          ? {
              playerId: activeRows[0].player_id,
              name: activeRows[0].name,
              count: parseInt(activeRows[0].count, 10),
            }
          : null,
        biggestGainer: eloRows[0]
          ? {
              playerId: eloRows[0].player_id,
              name: eloRows[0].name,
              change: parseInt(eloRows[0].net_change, 10),
            }
          : null,
        biggestLoser: eloRows.length > 0
          ? {
              playerId: eloRows[eloRows.length - 1].player_id,
              name: eloRows[eloRows.length - 1].name,
              change: parseInt(eloRows[eloRows.length - 1].net_change, 10),
            }
          : null,
        longestStreak: longestStreakResult,
        newAchievements: achievementRows.map((r) => ({
          playerId: r.player_id,
          playerName: r.player_name,
          achievementName: r.achievement_name,
          emoji: r.emoji,
        })),
      };
    },
  };
}
