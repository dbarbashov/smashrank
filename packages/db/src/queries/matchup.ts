import type { SqlLike } from "../sql-type.js";

export interface MatchupCandidate {
  player1_id: string;
  player1_name: string;
  player1_elo: number;
  player2_id: string;
  player2_name: string;
  player2_elo: number;
  elo_diff: number;
  h2h_total: number;
  h2h_p1_wins: number;
  h2h_p2_wins: number;
}

export function matchupQueries(sql: SqlLike) {
  return {
    async getMatchupCandidates(groupId: string): Promise<MatchupCandidate[]> {
      return sql<MatchupCandidate[]>`
        WITH active_members AS (
          SELECT gm.player_id, p.display_name, gm.elo_rating
          FROM group_members gm
          JOIN players p ON p.id = gm.player_id
          WHERE gm.group_id = ${groupId}
            AND gm.games_played >= 3
        ),
        pairs AS (
          SELECT
            a.player_id AS player1_id, a.display_name AS player1_name, a.elo_rating AS player1_elo,
            b.player_id AS player2_id, b.display_name AS player2_name, b.elo_rating AS player2_elo,
            ABS(a.elo_rating - b.elo_rating) AS elo_diff
          FROM active_members a
          JOIN active_members b ON a.player_id < b.player_id
        ),
        recent_played AS (
          SELECT DISTINCT
            LEAST(winner_id, loser_id) AS p1,
            GREATEST(winner_id, loser_id) AS p2
          FROM matches
          WHERE group_id = ${groupId}
            AND played_at > NOW() - INTERVAL '7 days'
        ),
        h2h_stats AS (
          SELECT
            LEAST(winner_id, loser_id) AS p1,
            GREATEST(winner_id, loser_id) AS p2,
            COUNT(*)::int AS h2h_total,
            COUNT(*) FILTER (WHERE winner_id = LEAST(winner_id, loser_id))::int AS p1_wins,
            COUNT(*) FILTER (WHERE winner_id = GREATEST(winner_id, loser_id))::int AS p2_wins
          FROM matches
          WHERE group_id = ${groupId}
          GROUP BY LEAST(winner_id, loser_id), GREATEST(winner_id, loser_id)
        )
        SELECT
          pairs.player1_id, pairs.player1_name, pairs.player1_elo,
          pairs.player2_id, pairs.player2_name, pairs.player2_elo,
          pairs.elo_diff,
          COALESCE(h.h2h_total, 0) AS h2h_total,
          COALESCE(h.p1_wins, 0) AS h2h_p1_wins,
          COALESCE(h.p2_wins, 0) AS h2h_p2_wins
        FROM pairs
        LEFT JOIN recent_played rp ON rp.p1 = pairs.player1_id AND rp.p2 = pairs.player2_id
        LEFT JOIN h2h_stats h ON h.p1 = pairs.player1_id AND h.p2 = pairs.player2_id
        WHERE rp.p1 IS NULL
        ORDER BY pairs.elo_diff ASC
        LIMIT 10
      `;
    },
  };
}
