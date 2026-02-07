import type { SqlLike } from "../sql-type.js";
import type { AchievementDefinition, PlayerAchievement } from "../types.js";

export function achievementQueries(sql: SqlLike) {
  return {
    async getPlayerAchievementIds(playerId: string): Promise<string[]> {
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
    ): Promise<(PlayerAchievement & { name: string; description: string; emoji: string })[]> {
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
