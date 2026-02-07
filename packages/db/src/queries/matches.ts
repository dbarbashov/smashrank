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
      winner_partner_id?: string;
      loser_partner_id?: string;
      elo_before_winner_partner?: number;
      elo_before_loser_partner?: number;
      tournament_id?: string;
    }): Promise<Match> {
      const rows = await sql<Match[]>`
        INSERT INTO matches (
          match_type, season_id, group_id,
          winner_id, loser_id,
          winner_score, loser_score, set_scores,
          elo_before_winner, elo_before_loser, elo_change,
          reported_by,
          winner_partner_id, loser_partner_id,
          elo_before_winner_partner, elo_before_loser_partner,
          tournament_id
        ) VALUES (
          ${data.match_type}, ${data.season_id}, ${data.group_id},
          ${data.winner_id}, ${data.loser_id},
          ${data.winner_score}, ${data.loser_score}, ${data.set_scores ? JSON.stringify(data.set_scores) : null}::jsonb,
          ${data.elo_before_winner}, ${data.elo_before_loser}, ${data.elo_change},
          ${data.reported_by},
          ${data.winner_partner_id ?? null}, ${data.loser_partner_id ?? null},
          ${data.elo_before_winner_partner ?? null}, ${data.elo_before_loser_partner ?? null},
          ${data.tournament_id ?? null}
        )
        RETURNING *
      `;
      return rows[0];
    },

    async findById(
      matchId: string,
    ): Promise<
      | (Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })
      | undefined
    > {
      const rows = await sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
        SELECT
          m.*,
          w.display_name AS winner_name,
          l.display_name AS loser_name,
          wp.display_name AS winner_partner_name,
          lp.display_name AS loser_partner_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        LEFT JOIN players wp ON wp.id = m.winner_partner_id
        LEFT JOIN players lp ON lp.id = m.loser_partner_id
        WHERE m.id = ${matchId}
        LIMIT 1
      `;
      return rows[0];
    },

    async listByGroup(
      groupId: string,
      opts: { limit?: number; offset?: number; matchType?: string; playerId?: string } = {},
    ): Promise<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]> {
      const limit = opts.limit ?? 20;
      const offset = opts.offset ?? 0;

      if (opts.matchType && opts.playerId) {
        return sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
          SELECT m.*, w.display_name AS winner_name, l.display_name AS loser_name, wp.display_name AS winner_partner_name, lp.display_name AS loser_partner_name
          FROM matches m
          JOIN players w ON w.id = m.winner_id
          JOIN players l ON l.id = m.loser_id
          LEFT JOIN players wp ON wp.id = m.winner_partner_id
          LEFT JOIN players lp ON lp.id = m.loser_partner_id
          WHERE m.group_id = ${groupId}
            AND m.match_type = ${opts.matchType}
            AND (m.winner_id = ${opts.playerId} OR m.loser_id = ${opts.playerId}
                 OR m.winner_partner_id = ${opts.playerId} OR m.loser_partner_id = ${opts.playerId})
          ORDER BY m.played_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      if (opts.matchType) {
        return sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
          SELECT m.*, w.display_name AS winner_name, l.display_name AS loser_name, wp.display_name AS winner_partner_name, lp.display_name AS loser_partner_name
          FROM matches m
          JOIN players w ON w.id = m.winner_id
          JOIN players l ON l.id = m.loser_id
          LEFT JOIN players wp ON wp.id = m.winner_partner_id
          LEFT JOIN players lp ON lp.id = m.loser_partner_id
          WHERE m.group_id = ${groupId} AND m.match_type = ${opts.matchType}
          ORDER BY m.played_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      if (opts.playerId) {
        return sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
          SELECT m.*, w.display_name AS winner_name, l.display_name AS loser_name, wp.display_name AS winner_partner_name, lp.display_name AS loser_partner_name
          FROM matches m
          JOIN players w ON w.id = m.winner_id
          JOIN players l ON l.id = m.loser_id
          LEFT JOIN players wp ON wp.id = m.winner_partner_id
          LEFT JOIN players lp ON lp.id = m.loser_partner_id
          WHERE m.group_id = ${groupId}
            AND (m.winner_id = ${opts.playerId} OR m.loser_id = ${opts.playerId}
                 OR m.winner_partner_id = ${opts.playerId} OR m.loser_partner_id = ${opts.playerId})
          ORDER BY m.played_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      return sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
        SELECT m.*, w.display_name AS winner_name, l.display_name AS loser_name, wp.display_name AS winner_partner_name, lp.display_name AS loser_partner_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        LEFT JOIN players wp ON wp.id = m.winner_partner_id
        LEFT JOIN players lp ON lp.id = m.loser_partner_id
        WHERE m.group_id = ${groupId}
        ORDER BY m.played_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    },

    async listByPlayer(
      playerId: string,
      groupId: string,
      opts: { limit?: number; offset?: number } = {},
    ): Promise<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]> {
      const limit = opts.limit ?? 20;
      const offset = opts.offset ?? 0;
      return sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
        SELECT m.*, w.display_name AS winner_name, l.display_name AS loser_name, wp.display_name AS winner_partner_name, lp.display_name AS loser_partner_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        LEFT JOIN players wp ON wp.id = m.winner_partner_id
        LEFT JOIN players lp ON lp.id = m.loser_partner_id
        WHERE m.group_id = ${groupId}
          AND (m.winner_id = ${playerId} OR m.loser_id = ${playerId}
               OR m.winner_partner_id = ${playerId} OR m.loser_partner_id = ${playerId})
        ORDER BY m.played_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    },

    async getEloHistory(
      playerId: string,
      groupId: string,
    ): Promise<{ played_at: Date; elo_after: number; match_id: string }[]> {
      return sql<{ played_at: Date; elo_after: number; match_id: string }[]>`
        SELECT
          m.played_at,
          m.id AS match_id,
          CASE
            WHEN m.winner_id = ${playerId} OR m.winner_partner_id = ${playerId}
              THEN m.elo_before_winner + m.elo_change
            ELSE m.elo_before_loser - m.elo_change
          END AS elo_after
        FROM matches m
        WHERE m.group_id = ${groupId}
          AND (m.winner_id = ${playerId} OR m.loser_id = ${playerId}
               OR m.winner_partner_id = ${playerId} OR m.loser_partner_id = ${playerId})
        ORDER BY m.played_at ASC
      `;
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
        id: string;
        display_name: string;
        elo_rating: number;
        games_played: number;
        wins: number;
        losses: number;
        current_streak: number;
        best_streak: number;
      }[]
    > {
      return sql`
        SELECT
          p.id,
          p.display_name,
          p.elo_rating,
          p.games_played,
          p.wins,
          p.losses,
          p.current_streak,
          p.best_streak
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
      (Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]
    > {
      return sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
        SELECT
          m.*,
          w.display_name AS winner_name,
          l.display_name AS loser_name,
          wp.display_name AS winner_partner_name,
          lp.display_name AS loser_partner_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        LEFT JOIN players wp ON wp.id = m.winner_partner_id
        LEFT JOIN players lp ON lp.id = m.loser_partner_id
        WHERE m.winner_id = ${playerId} OR m.loser_id = ${playerId}
              OR m.winner_partner_id = ${playerId} OR m.loser_partner_id = ${playerId}
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
      recent: (Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[];
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

      const recent = await sql<(Match & { winner_name: string; loser_name: string; winner_partner_name: string | null; loser_partner_name: string | null })[]>`
        SELECT
          m.*,
          w.display_name AS winner_name,
          l.display_name AS loser_name,
          wp.display_name AS winner_partner_name,
          lp.display_name AS loser_partner_name
        FROM matches m
        JOIN players w ON w.id = m.winner_id
        JOIN players l ON l.id = m.loser_id
        LEFT JOIN players wp ON wp.id = m.winner_partner_id
        LEFT JOIN players lp ON lp.id = m.loser_partner_id
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

    async countMatchesBetween(
      playerA: string,
      playerB: string,
    ): Promise<number> {
      const rows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM matches
        WHERE (winner_id = ${playerA} AND loser_id = ${playerB})
           OR (winner_id = ${playerB} AND loser_id = ${playerA})
      `;
      return parseInt(rows[0].count, 10);
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
