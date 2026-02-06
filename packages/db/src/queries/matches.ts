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
      minutes: number = 2,
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
  };
}
