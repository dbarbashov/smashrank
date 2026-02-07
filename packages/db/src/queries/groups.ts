import crypto from "node:crypto";
import type { SqlLike } from "../sql-type.js";
import type { Group } from "../types.js";

export function groupQueries(sql: SqlLike) {
  return {
    async findByChatId(chatId: number): Promise<Group | undefined> {
      const rows = await sql<Group[]>`
        SELECT * FROM groups WHERE chat_id = ${chatId} LIMIT 1
      `;
      return rows[0];
    },

    async create(data: {
      chat_id: number;
      name: string | null;
      language?: string;
    }): Promise<Group> {
      const slug = crypto.randomBytes(6).toString("hex");
      const rows = await sql<Group[]>`
        INSERT INTO groups (chat_id, name, slug, language)
        VALUES (${data.chat_id}, ${data.name}, ${slug}, ${data.language ?? "en"})
        RETURNING *
      `;
      return rows[0];
    },

    async ensureMembership(groupId: string, playerId: string): Promise<void> {
      await sql`
        INSERT INTO group_members (group_id, player_id)
        VALUES (${groupId}, ${playerId})
        ON CONFLICT (group_id, player_id) DO NOTHING
      `;
    },

    async updateLanguage(groupId: string, language: string): Promise<void> {
      await sql`UPDATE groups SET language = ${language} WHERE id = ${groupId}`;
    },

    async updateSettings(groupId: string, settings: Record<string, unknown>): Promise<void> {
      await sql`
        UPDATE groups SET settings = settings || ${sql.json(settings as Record<string, string | number | boolean | null>)}
        WHERE id = ${groupId}
      `;
    },

    async getAllGroupsWithDigest(): Promise<Group[]> {
      return sql<Group[]>`
        SELECT * FROM groups
        WHERE settings->>'digest' IS NOT NULL
          AND settings->>'digest' != 'off'
      `;
    },
  };
}
