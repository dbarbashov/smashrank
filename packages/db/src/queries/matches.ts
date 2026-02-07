import type { SqlLike } from "../sql-type.js";
import type { Match } from "../types.js";

export function matchQueries(sql: SqlLike) {
  return {
    async create(data: {
      match_type: string;
      season_id: string;
      group_id: string;
      winner_id: string;
      loser_id: string;
      winner_score: number;
      loser_score: number;
      set_scores: { w: number; l: number }[] | null;
      elo_before_winner: number;
      elo_before_loser: number;
      elo_change: number;
      reported_by: string;
    }): Promise<Match> {
      const rows = await sql<Match[]>`
        INSERT INTO matches (
          match_type, season_id, group_id,
          winner_id, loser_id,
          winner_score, loser_score, set_scores,
          elo_before_winner, elo_before_loser, elo_change,
          reported_by
        ) VALUES (
          ${data.match_type}, ${data.season_id}, ${data.group_id},
          ${data.winner_id}, ${data.loser_id},
          ${data.winner_score}, ${data.loser_score}, ${data.set_scores ? JSON.stringify(data.set_scores) : null}::jsonb,
          ${data.elo_before_winner}, ${data.elo_before_loser}, ${data.elo_change},
          ${data.reported_by}
        )
        RETURNING *
      `;
      return rows[0];
    },

    async findRecentBetweenPlayers(
      playerA: string,
      playerB: string,
      minutes: number = 0.5,
    ): Promise<Match | undefined> {
      const rows = await sql<Match[]>`
        SELECT * FROM matches
        WHERE played_at > NOW() - INTERVAL '1 minute' * ${minutes}
          AND (
            (winner_id = ${playerA} AND loser_id = ${playerB})
            OR (winner_id = ${playerB} AND loser_id = ${playerA})
          )
        ORDER BY played_at DESC
        LIMIT 1
      `;
      return rows[0];
    },

    async getLeaderboard(
      groupId: string,
      limit: number = 20,
    ): Promise<
      {
        display_name: string;
        elo_rating: number;
        games_played: number;
        wins: number;
        losses: number;
        current_streak: number;
      }[]
    > {
      return sql`
        SELECT
          p.display_name,
          p.elo_rating,
          p.games_played,
          p.wins,
          p.losses,
          p.current_streak
        FROM players p
        JOIN group_members gm ON gm.player_id = p.id
        WHERE gm.group_id = ${groupId} AND p.games_played > 0
        ORDER BY p.elo_rating DESC
        LIMIT ${limit}
      `;
    },

    async getPlayerStats(
      playerId: string,
      groupId: string,
    ): Promise<{
      rank: number;
      total_in_group: number;
    } | undefined> {
      const rows = await sql<{ rank: number; total_in_group: number }[]>`
        SELECT
          rank,
          total_in_group
        FROM (
          SELECT
            p.id,
            ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC) AS rank,
            COUNT(*) OVER () AS total_in_group
          FROM players p
          JOIN group_members gm ON gm.player_id = p.id
          WHERE gm.group_id = ${groupId} AND p.games_played > 0
        ) ranked
        WHERE id = ${playerId}
      `;
      return rows[0];
    },

    async findLastByReporter(
      reporterId: string,
      minutes: number = 5,
    ): Promise<Match | undefined> {
      const rows = await sql<Match[]>`
        SELECT * FROM matches
        WHERE reported_by = ${reporterId}
          AND played_at > NOW() - INTERVAL '1 minute' * ${minutes}
        ORDER BY played_at DESC
        LIMIT 1
      `;
      return rows[0];
    },

    async deleteById(matchId: string): Promise<void> {
      await sql`DELETE FROM matches WHERE id = ${matchId}`;
    },

    async getPlayerRecentMatches(
      playerId: string,
      limit: number = 5,
    ): Promise<
      (Match & { winner_name: string; loser_name: string })[]
    > {
      return sql<(Match & { winner_name: string; loser_name: string })[]>`
        SELECT
          m.*,
          w.display_name AS winner_name,
          l.display_name AS loser_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        WHERE m.winner_id = ${playerId} OR m.loser_id = ${playerId}
        ORDER BY m.played_at DESC
        LIMIT ${limit}
      `;
    },

    async recalculateStreaks(
      playerId: string,
    ): Promise<{ currentStreak: number; bestStreak: number }> {
      const rows = await sql<{ winner_id: string }[]>`
        SELECT winner_id FROM matches
        WHERE winner_id = ${playerId} OR loser_id = ${playerId}
        ORDER BY played_at ASC
      `;

      let currentStreak = 0;
      let bestStreak = 0;

      for (const row of rows) {
        const won = row.winner_id === playerId;
        if (won) {
          currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        } else {
          currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        }
        bestStreak = Math.max(bestStreak, currentStreak);
      }

      return { currentStreak, bestStreak };
    },

    async getH2H(
      playerA: string,
      playerB: string,
      groupId: string,
    ): Promise<{
      totalMatches: number;
      winsA: number;
      winsB: number;
      recent: (Match & { winner_name: string; loser_name: string })[];
    }> {
      const countRows = await sql<{ total: string; wins_a: string; wins_b: string }[]>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE winner_id = ${playerA})::text AS wins_a,
          COUNT(*) FILTER (WHERE winner_id = ${playerB})::text AS wins_b
        FROM matches
        WHERE group_id = ${groupId}
          AND (
            (winner_id = ${playerA} AND loser_id = ${playerB})
            OR (winner_id = ${playerB} AND loser_id = ${playerA})
          )
      `;

      const recent = await sql<(Match & { winner_name: string; loser_name: string })[]>`
        SELECT
          m.*,
          w.display_name AS winner_name,
          l.display_name AS loser_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        WHERE m.group_id = ${groupId}
          AND (
            (m.winner_id = ${playerA} AND m.loser_id = ${playerB})
            OR (m.winner_id = ${playerB} AND m.loser_id = ${playerA})
          )
        ORDER BY m.played_at DESC
        LIMIT 5
      `;

      const c = countRows[0];
      return {
        totalMatches: parseInt(c.total, 10),
        winsA: parseInt(c.wins_a, 10),
        winsB: parseInt(c.wins_b, 10),
        recent,
      };
    },

    async getRecentOpponents(
      playerId: string,
      groupId: string,
      limit: number = 5,
    ): Promise<{ id: string; display_name: string }[]> {
      return sql<{ id: string; display_name: string }[]>`
        SELECT DISTINCT ON (opponent_id) opponent_id AS id, p.display_name
        FROM (
          SELECT
            CASE WHEN winner_id = ${playerId} THEN loser_id ELSE winner_id END AS opponent_id,
            played_at
          FROM matches
          WHERE group_id = ${groupId}
            AND (winner_id = ${playerId} OR loser_id = ${playerId})
        ) sub
        JOIN players p ON p.id = sub.opponent_id
        ORDER BY opponent_id, sub.played_at DESC
        LIMIT ${limit}
      `;
    },
  };
}
