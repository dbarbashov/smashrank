import crypto from "node:crypto";
import type { SqlLike } from "../sql-type.js";
import type { Group, GroupMember } from "../types.js";

export function groupQueries(sql: SqlLike) {
  return {
    async findById(id: string): Promise<Group | undefined> {
      const rows = await sql<Group[]>`
        SELECT * FROM groups WHERE id = ${id} LIMIT 1
      `;
      return rows[0];
    },

    async findByChatId(chatId: number): Promise<Group | undefined> {
      const rows = await sql<Group[]>`
        SELECT * FROM groups WHERE chat_id = ${chatId} LIMIT 1
      `;
      return rows[0];
    },

    async findBySlug(slug: string): Promise<Group | undefined> {
      const rows = await sql<Group[]>`
        SELECT * FROM groups WHERE slug = ${slug} LIMIT 1
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

    async ensureMembership(groupId: string, playerId: string): Promise<GroupMember> {
      const rows = await sql<GroupMember[]>`
        INSERT INTO group_members (group_id, player_id)
        VALUES (${groupId}, ${playerId})
        ON CONFLICT (group_id, player_id) DO UPDATE SET group_id = group_members.group_id
        RETURNING *
      `;
      return rows[0];
    },

    async getGroupMember(groupId: string, playerId: string): Promise<GroupMember | undefined> {
      const rows = await sql<GroupMember[]>`
        SELECT * FROM group_members
        WHERE group_id = ${groupId} AND player_id = ${playerId}
        LIMIT 1
      `;
      return rows[0];
    },

    async isMember(groupId: string, playerId: string): Promise<boolean> {
      const rows = await sql<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM group_members
          WHERE group_id = ${groupId} AND player_id = ${playerId}
        ) AS exists
      `;
      return rows[0].exists;
    },

    async updateGroupElo(
      groupId: string,
      playerId: string,
      eloRating: number,
      won: boolean,
      currentStreak: number,
      bestStreak: number,
    ): Promise<void> {
      if (won) {
        await sql`
          UPDATE group_members SET
            elo_rating = ${eloRating},
            games_played = games_played + 1,
            wins = wins + 1,
            current_streak = ${currentStreak},
            best_streak = ${bestStreak}
          WHERE group_id = ${groupId} AND player_id = ${playerId}
        `;
      } else {
        await sql`
          UPDATE group_members SET
            elo_rating = ${eloRating},
            games_played = games_played + 1,
            losses = losses + 1,
            current_streak = ${currentStreak},
            best_streak = ${bestStreak}
          WHERE group_id = ${groupId} AND player_id = ${playerId}
        `;
      }
    },

    async updateGroupDoublesElo(
      groupId: string,
      playerId: string,
      eloRating: number,
      won: boolean,
      currentStreak: number,
      bestStreak: number,
    ): Promise<void> {
      if (won) {
        await sql`
          UPDATE group_members SET
            doubles_elo_rating = ${eloRating},
            doubles_games_played = doubles_games_played + 1,
            doubles_wins = doubles_wins + 1,
            doubles_current_streak = ${currentStreak},
            doubles_best_streak = ${bestStreak}
          WHERE group_id = ${groupId} AND player_id = ${playerId}
        `;
      } else {
        await sql`
          UPDATE group_members SET
            doubles_elo_rating = ${eloRating},
            doubles_games_played = doubles_games_played + 1,
            doubles_losses = doubles_losses + 1,
            doubles_current_streak = ${currentStreak},
            doubles_best_streak = ${bestStreak}
          WHERE group_id = ${groupId} AND player_id = ${playerId}
        `;
      }
    },

    async updateGroupEloForDraw(
      groupId: string,
      playerId: string,
      eloRating: number,
    ): Promise<void> {
      await sql`
        UPDATE group_members SET
          elo_rating = ${eloRating},
          games_played = games_played + 1,
          current_streak = 0
        WHERE group_id = ${groupId} AND player_id = ${playerId}
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

    async getAllGroupsWithMatchup(): Promise<Group[]> {
      return sql<Group[]>`
        SELECT * FROM groups
        WHERE settings->>'matchup_of_day' = 'on'
      `;
    },

    async getAllGroupsWithDecay(): Promise<Group[]> {
      return sql<Group[]>`
        SELECT * FROM groups
        WHERE settings->>'elo_decay' = 'on'
      `;
    },

    async getInactiveMembers(
      groupId: string,
      inactiveDays: number = 14,
    ): Promise<{ player_id: string; elo_rating: number; last_active: Date | null }[]> {
      return sql<{ player_id: string; elo_rating: number; last_active: Date | null }[]>`
        SELECT gm.player_id, gm.elo_rating, p.last_active
        FROM group_members gm
        JOIN players p ON p.id = gm.player_id
        WHERE gm.group_id = ${groupId}
          AND gm.games_played > 0
          AND (p.last_active IS NULL OR p.last_active < NOW() - INTERVAL '1 day' * ${inactiveDays})
      `;
    },

    async setEloRating(groupId: string, playerId: string, newElo: number): Promise<void> {
      await sql`
        UPDATE group_members
        SET elo_rating = ${newElo}
        WHERE group_id = ${groupId} AND player_id = ${playerId}
      `;
    },
  };
}
