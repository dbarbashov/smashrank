import type { SqlLike } from "../sql-type.js";
import type { AchievementDefinition, PlayerAchievement } from "../types.js";

export function achievementQueries(sql: SqlLike) {
  return {
    async listDefinitions(): Promise<AchievementDefinition[]> {
      return sql<AchievementDefinition[]>`
        SELECT * FROM achievement_definitions ORDER BY id ASC
      `;
    },

    async listRecent(
      groupId: string,
      limit: number = 10,
    ): Promise<(PlayerAchievement & { display_name: string; name: string; emoji: string })[]> {
      return sql<(PlayerAchievement & { display_name: string; name: string; emoji: string })[]>`
        SELECT
          pa.*,
          p.display_name,
          ad.name,
          ad.emoji
        FROM player_achievements pa
        JOIN players p ON p.id = pa.player_id
        JOIN achievement_definitions ad ON ad.id = pa.achievement_id
        JOIN matches m ON m.id = pa.match_id
        WHERE m.group_id = ${groupId}
        ORDER BY pa.unlocked_at DESC
        LIMIT ${limit}
      `;
    },

    async getPlayerAchievementIds(playerId: string, groupId?: string): Promise<string[]> {
      if (groupId) {
        const rows = await sql<{ achievement_id: string }[]>`
          SELECT DISTINCT pa.achievement_id FROM player_achievements pa
          LEFT JOIN matches m ON m.id = pa.match_id
          WHERE pa.player_id = ${playerId}
            AND (m.group_id = ${groupId} OR pa.match_id IS NULL)
        `;
        return rows.map((r) => r.achievement_id);
      }
      const rows = await sql<{ achievement_id: string }[]>`
        SELECT achievement_id FROM player_achievements
        WHERE player_id = ${playerId}
      `;
      return rows.map((r) => r.achievement_id);
    },

    async unlockMany(
      items: { playerId: string; achievementId: string; matchId: string }[],
    ): Promise<void> {
      if (items.length === 0) return;
      for (const item of items) {
        await sql`
          INSERT INTO player_achievements (player_id, achievement_id, match_id)
          VALUES (${item.playerId}, ${item.achievementId}, ${item.matchId})
          ON CONFLICT (player_id, achievement_id) DO NOTHING
        `;
      }
    },

    async getPlayerAchievements(
      playerId: string,
      groupId?: string,
    ): Promise<(PlayerAchievement & { name: string; description: string; emoji: string })[]> {
      if (groupId) {
        return sql<(PlayerAchievement & { name: string; description: string; emoji: string })[]>`
          SELECT
            pa.*,
            ad.name,
            ad.description,
            ad.emoji
          FROM player_achievements pa
          JOIN achievement_definitions ad ON ad.id = pa.achievement_id
          LEFT JOIN matches m ON m.id = pa.match_id
          WHERE pa.player_id = ${playerId}
            AND (m.group_id = ${groupId} OR pa.match_id IS NULL)
          ORDER BY pa.unlocked_at DESC
        `;
      }
      return sql<(PlayerAchievement & { name: string; description: string; emoji: string })[]>`
        SELECT
          pa.*,
          ad.name,
          ad.description,
          ad.emoji
        FROM player_achievements pa
        JOIN achievement_definitions ad ON ad.id = pa.achievement_id
        WHERE pa.player_id = ${playerId}
        ORDER BY pa.unlocked_at DESC
      `;
    },

    async deleteByMatchId(matchId: string): Promise<void> {
      await sql`DELETE FROM player_achievements WHERE match_id = ${matchId}`;
    },
  };
}
