import type { SqlLike } from "../sql-type.js";
import type { Season, SeasonSnapshot } from "../types.js";

export function seasonQueries(sql: SqlLike) {
  return {
    async findById(seasonId: string): Promise<Season | undefined> {
      const rows = await sql<Season[]>`
        SELECT * FROM seasons WHERE id = ${seasonId} LIMIT 1
      `;
      return rows[0];
    },

    async listByGroup(groupId: string): Promise<Season[]> {
      return sql<Season[]>`
        SELECT * FROM seasons
        WHERE group_id = ${groupId}
        ORDER BY start_date DESC
      `;
    },

    async getSnapshots(
      seasonId: string,
    ): Promise<(SeasonSnapshot & { display_name: string })[]> {
      return sql<(SeasonSnapshot & { display_name: string })[]>`
        SELECT ss.*, p.display_name
        FROM season_snapshots ss
        JOIN players p ON p.id = ss.player_id
        WHERE ss.season_id = ${seasonId}
        ORDER BY ss.final_rank ASC
      `;
    },

    async findActive(groupId: string): Promise<Season | undefined> {
      const rows = await sql<Season[]>`
        SELECT * FROM seasons
        WHERE group_id = ${groupId} AND is_active = true
        LIMIT 1
      `;
      return rows[0];
    },

    async create(data: {
      group_id: string;
      name: string;
      start_date: string;
      end_date: string;
    }): Promise<Season> {
      const rows = await sql<Season[]>`
        INSERT INTO seasons (group_id, name, start_date, end_date)
        VALUES (${data.group_id}, ${data.name}, ${data.start_date}, ${data.end_date})
        RETURNING *
      `;
      return rows[0];
    },

    async deactivate(seasonId: string): Promise<void> {
      await sql`UPDATE seasons SET is_active = false WHERE id = ${seasonId}`;
    },

    async createSnapshot(
      seasonId: string,
      groupId: string,
    ): Promise<void> {
      await sql`
        INSERT INTO season_snapshots (season_id, player_id, final_elo, final_rank, games_played, wins, losses)
        SELECT
          ${seasonId},
          p.id,
          p.elo_rating,
          ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC),
          p.games_played,
          p.wins,
          p.losses
        FROM players p
        JOIN group_members gm ON gm.player_id = p.id
        WHERE gm.group_id = ${groupId} AND p.games_played > 0
      `;
    },

    async resetPlayersForGroup(groupId: string): Promise<void> {
      await sql`
        UPDATE players SET
          elo_rating = 1000,
          games_played = 0,
          wins = 0,
          losses = 0,
          current_streak = 0,
          best_streak = 0
        WHERE id IN (
          SELECT player_id FROM group_members WHERE group_id = ${groupId}
        )
      `;
    },
  };
}
