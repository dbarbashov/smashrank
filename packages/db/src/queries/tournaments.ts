import type { SqlLike } from "../sql-type.js";
import type { Tournament, TournamentParticipant, TournamentStanding } from "../types.js";

export function tournamentQueries(sql: SqlLike) {
  return {
    async create(data: {
      group_id: string;
      name: string;
      created_by: string;
      max_players?: number;
    }): Promise<Tournament> {
      const rows = await sql<Tournament[]>`
        INSERT INTO tournaments (group_id, name, created_by, max_players)
        VALUES (${data.group_id}, ${data.name}, ${data.created_by}, ${data.max_players ?? 12})
        RETURNING *
      `;
      return rows[0];
    },

    async findById(id: string): Promise<Tournament | undefined> {
      const rows = await sql<Tournament[]>`
        SELECT * FROM tournaments WHERE id = ${id} LIMIT 1
      `;
      return rows[0];
    },

    async findActiveByGroup(groupId: string): Promise<Tournament | undefined> {
      const rows = await sql<Tournament[]>`
        SELECT * FROM tournaments
        WHERE group_id = ${groupId} AND status IN ('open', 'active')
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return rows[0];
    },

    async listByGroup(groupId: string): Promise<(Tournament & { participant_count: number })[]> {
      return sql<(Tournament & { participant_count: number })[]>`
        SELECT t.*,
          (SELECT COUNT(*)::int FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS participant_count
        FROM tournaments t
        WHERE t.group_id = ${groupId}
        ORDER BY t.created_at DESC
      `;
    },

    async updateStatus(id: string, status: "open" | "active" | "completed"): Promise<void> {
      if (status === "active") {
        await sql`UPDATE tournaments SET status = ${status}, started_at = NOW() WHERE id = ${id}`;
      } else if (status === "completed") {
        await sql`UPDATE tournaments SET status = ${status}, completed_at = NOW() WHERE id = ${id}`;
      } else {
        await sql`UPDATE tournaments SET status = ${status} WHERE id = ${id}`;
      }
    },

    // Participants
    async addParticipant(tournamentId: string, playerId: string): Promise<void> {
      await sql`
        INSERT INTO tournament_participants (tournament_id, player_id)
        VALUES (${tournamentId}, ${playerId})
        ON CONFLICT DO NOTHING
      `;
    },

    async removeParticipant(tournamentId: string, playerId: string): Promise<void> {
      await sql`
        DELETE FROM tournament_participants
        WHERE tournament_id = ${tournamentId} AND player_id = ${playerId}
      `;
    },

    async getParticipants(tournamentId: string): Promise<(TournamentParticipant & { display_name: string; elo_rating: number })[]> {
      return sql<(TournamentParticipant & { display_name: string; elo_rating: number })[]>`
        SELECT tp.*, p.display_name, gm.elo_rating
        FROM tournament_participants tp
        JOIN players p ON p.id = tp.player_id
        JOIN tournaments t ON t.id = tp.tournament_id
        JOIN group_members gm ON gm.player_id = tp.player_id AND gm.group_id = t.group_id
        WHERE tp.tournament_id = ${tournamentId}
        ORDER BY tp.joined_at ASC
      `;
    },

    async getParticipantCount(tournamentId: string): Promise<number> {
      const rows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM tournament_participants
        WHERE tournament_id = ${tournamentId}
      `;
      return parseInt(rows[0].count, 10);
    },

    async isParticipant(tournamentId: string, playerId: string): Promise<boolean> {
      const rows = await sql<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM tournament_participants
          WHERE tournament_id = ${tournamentId} AND player_id = ${playerId}
        ) AS exists
      `;
      return rows[0].exists;
    },

    // Standings
    async initStandings(tournamentId: string): Promise<void> {
      await sql`
        INSERT INTO tournament_standings (tournament_id, player_id)
        SELECT ${tournamentId}, player_id
        FROM tournament_participants
        WHERE tournament_id = ${tournamentId}
      `;
    },

    async getStandings(tournamentId: string): Promise<(TournamentStanding & { display_name: string; elo_rating: number })[]> {
      return sql<(TournamentStanding & { display_name: string; elo_rating: number })[]>`
        SELECT ts.*, p.display_name, gm.elo_rating
        FROM tournament_standings ts
        JOIN players p ON p.id = ts.player_id
        JOIN tournaments t ON t.id = ts.tournament_id
        JOIN group_members gm ON gm.player_id = ts.player_id AND gm.group_id = t.group_id
        WHERE ts.tournament_id = ${tournamentId}
        ORDER BY ts.points DESC, (ts.sets_won - ts.sets_lost) DESC, gm.elo_rating DESC
      `;
    },

    async updateStanding(
      tournamentId: string,
      playerId: string,
      result: "win" | "draw" | "loss",
      setsWon: number,
      setsLost: number,
    ): Promise<void> {
      const pointsDelta = result === "win" ? 3 : result === "draw" ? 1 : 0;
      const winsDelta = result === "win" ? 1 : 0;
      const drawsDelta = result === "draw" ? 1 : 0;
      const lossesDelta = result === "loss" ? 1 : 0;

      await sql`
        UPDATE tournament_standings SET
          points = points + ${pointsDelta},
          wins = wins + ${winsDelta},
          draws = draws + ${drawsDelta},
          losses = losses + ${lossesDelta},
          sets_won = sets_won + ${setsWon},
          sets_lost = sets_lost + ${setsLost}
        WHERE tournament_id = ${tournamentId} AND player_id = ${playerId}
      `;
    },

    // Fixtures: cross-join participants LEFT JOIN matches to find unplayed
    async getFixtures(tournamentId: string): Promise<{
      player1_id: string;
      player1_name: string;
      player2_id: string;
      player2_name: string;
      match_id: string | null;
      winner_id: string | null;
      winner_score: number | null;
      loser_score: number | null;
    }[]> {
      return sql<{
        player1_id: string;
        player1_name: string;
        player2_id: string;
        player2_name: string;
        match_id: string | null;
        winner_id: string | null;
        winner_score: number | null;
        loser_score: number | null;
      }[]>`
        SELECT
          p1.id AS player1_id,
          p1.display_name AS player1_name,
          p2.id AS player2_id,
          p2.display_name AS player2_name,
          m.id AS match_id,
          m.winner_id,
          m.winner_score,
          m.loser_score
        FROM tournament_participants tp1
        JOIN tournament_participants tp2
          ON tp1.tournament_id = tp2.tournament_id AND tp1.player_id < tp2.player_id
        JOIN players p1 ON p1.id = tp1.player_id
        JOIN players p2 ON p2.id = tp2.player_id
        LEFT JOIN matches m
          ON m.tournament_id = ${tournamentId}
          AND (
            (m.winner_id = tp1.player_id AND m.loser_id = tp2.player_id)
            OR (m.winner_id = tp2.player_id AND m.loser_id = tp1.player_id)
          )
        WHERE tp1.tournament_id = ${tournamentId}
        ORDER BY p1.display_name, p2.display_name
      `;
    },

    async getUnplayedFixtures(tournamentId: string): Promise<{
      player1_id: string;
      player2_id: string;
    }[]> {
      return sql<{ player1_id: string; player2_id: string }[]>`
        SELECT tp1.player_id AS player1_id, tp2.player_id AS player2_id
        FROM tournament_participants tp1
        JOIN tournament_participants tp2
          ON tp1.tournament_id = tp2.tournament_id AND tp1.player_id < tp2.player_id
        WHERE tp1.tournament_id = ${tournamentId}
          AND NOT EXISTS (
            SELECT 1 FROM matches m
            WHERE m.tournament_id = ${tournamentId}
              AND (
                (m.winner_id = tp1.player_id AND m.loser_id = tp2.player_id)
                OR (m.winner_id = tp2.player_id AND m.loser_id = tp1.player_id)
              )
          )
      `;
    },

    async getUnplayedCount(tournamentId: string): Promise<number> {
      const rows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM tournament_participants tp1
        JOIN tournament_participants tp2
          ON tp1.tournament_id = tp2.tournament_id AND tp1.player_id < tp2.player_id
        WHERE tp1.tournament_id = ${tournamentId}
          AND NOT EXISTS (
            SELECT 1 FROM matches m
            WHERE m.tournament_id = ${tournamentId}
              AND (
                (m.winner_id = tp1.player_id AND m.loser_id = tp2.player_id)
                OR (m.winner_id = tp2.player_id AND m.loser_id = tp1.player_id)
              )
          )
      `;
      return parseInt(rows[0].count, 10);
    },

    async getLastMatchTime(tournamentId: string): Promise<Date | null> {
      const rows = await sql<{ played_at: Date }[]>`
        SELECT played_at FROM matches
        WHERE tournament_id = ${tournamentId}
        ORDER BY played_at DESC
        LIMIT 1
      `;
      return rows[0]?.played_at ?? null;
    },

    async findStaleTournaments(staleDays: number = 14): Promise<Tournament[]> {
      return sql<Tournament[]>`
        SELECT t.* FROM tournaments t
        WHERE t.status = 'active'
          AND (
            -- No matches at all and started > staleDays ago
            (NOT EXISTS (SELECT 1 FROM matches m WHERE m.tournament_id = t.id)
             AND t.started_at < NOW() - INTERVAL '1 day' * ${staleDays})
            OR
            -- Last match was > staleDays ago
            ((SELECT MAX(m.played_at) FROM matches m WHERE m.tournament_id = t.id)
             < NOW() - INTERVAL '1 day' * ${staleDays})
          )
      `;
    },

    // For tournament completion: count draws per player
    async getPlayerDrawCount(tournamentId: string, playerId: string): Promise<number> {
      const rows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM matches
        WHERE tournament_id = ${tournamentId}
          AND winner_score = loser_score
          AND (winner_id = ${playerId} OR loser_id = ${playerId})
      `;
      return parseInt(rows[0].count, 10);
    },
  };
}
