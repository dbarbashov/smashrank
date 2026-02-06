import type { SqlLike } from "../sql-type.js";
import type { Player } from "../types.js";

export function playerQueries(sql: SqlLike) {
  return {
    async findByTelegramId(telegramId: number): Promise<Player | undefined> {
      const rows = await sql<Player[]>`
        SELECT * FROM players WHERE telegram_id = ${telegramId} LIMIT 1
      `;
      return rows[0];
    },

    async findById(id: string): Promise<Player | undefined> {
      const rows = await sql<Player[]>`
        SELECT * FROM players WHERE id = ${id} LIMIT 1
      `;
      return rows[0];
    },

    async findByUsername(username: string): Promise<Player | undefined> {
      const rows = await sql<Player[]>`
        SELECT * FROM players
        WHERE LOWER(telegram_username) = LOWER(${username})
        LIMIT 1
      `;
      return rows[0];
    },

    async create(data: {
      telegram_id: number;
      telegram_username: string | null;
      display_name: string;
      language?: string;
    }): Promise<Player> {
      const rows = await sql<Player[]>`
        INSERT INTO players (telegram_id, telegram_username, display_name, language)
        VALUES (${data.telegram_id}, ${data.telegram_username}, ${data.display_name}, ${data.language ?? "en"})
        RETURNING *
      `;
      return rows[0];
    },

    async updateElo(
      id: string,
      eloRating: number,
      won: boolean,
      currentStreak: number,
      bestStreak: number,
    ): Promise<void> {
      if (won) {
        await sql`
          UPDATE players SET
            elo_rating = ${eloRating},
            games_played = games_played + 1,
            wins = wins + 1,
            current_streak = ${currentStreak},
            best_streak = ${bestStreak},
            last_active = NOW()
          WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE players SET
            elo_rating = ${eloRating},
            games_played = games_played + 1,
            losses = losses + 1,
            current_streak = ${currentStreak},
            best_streak = ${bestStreak},
            last_active = NOW()
          WHERE id = ${id}
        `;
      }
    },

    async updateLanguage(id: string, language: string): Promise<void> {
      await sql`UPDATE players SET language = ${language} WHERE id = ${id}`;
    },
  };
}
