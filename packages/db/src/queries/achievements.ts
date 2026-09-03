import type { SqlLike } from "../sql-type.js";
import type {
  AchievementDefinition,
  AchievementDefinitionWithCount,
  AchievementHolderRow,
  PlayerAchievement,
} from "../types.js";

export function achievementQueries(sql: SqlLike) {
  return {
    async listDefinitions(): Promise<AchievementDefinition[]> {
      return sql<AchievementDefinition[]>`
        SELECT * FROM achievement_definitions ORDER BY id ASC
      `;
    },

    async listDefinitionsWithHolderCounts(
      groupId: string,
    ): Promise<AchievementDefinitionWithCount[]> {
      return sql<AchievementDefinitionWithCount[]>`
        SELECT
          ad.*,
          COUNT(pa.id)::int AS holder_count
        FROM achievement_definitions ad
        LEFT JOIN player_achievements pa
          ON pa.achievement_id = ad.id
          AND pa.group_id = ${groupId}
        GROUP BY ad.id
        ORDER BY ad.id ASC
      `;
    },

    async getDefinition(achievementId: string): Promise<AchievementDefinition | undefined> {
      const rows = await sql<AchievementDefinition[]>`
        SELECT *
        FROM achievement_definitions
        WHERE id = ${achievementId}
        LIMIT 1
      `;
      return rows[0];
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
        WHERE pa.group_id = ${groupId}
        ORDER BY pa.unlocked_at DESC
        LIMIT ${limit}
      `;
    },

    async getPlayerAchievementIds(playerId: string, groupId: string): Promise<string[]> {
      const rows = await sql<{ achievement_id: string }[]>`
        SELECT achievement_id
        FROM player_achievements
        WHERE player_id = ${playerId} AND group_id = ${groupId}
      `;
      return rows.map((r) => r.achievement_id);
    },

    async unlockMany(
      groupId: string,
      items: { playerId: string; achievementId: string; matchId: string }[],
    ): Promise<void> {
      if (items.length === 0) return;
      for (const item of items) {
        await sql`
          INSERT INTO player_achievements (group_id, player_id, achievement_id, match_id)
          VALUES (${groupId}, ${item.playerId}, ${item.achievementId}, ${item.matchId})
          ON CONFLICT (group_id, player_id, achievement_id) WHERE group_id IS NOT NULL DO NOTHING
        `;
      }
    },

    async getPlayerAchievements(
      playerId: string,
      groupId?: string,
    ): Promise<(PlayerAchievement & { name: string; description: string; emoji: string })[]> {
      if (!groupId) {
        return sql<(PlayerAchievement & { name: string; description: string; emoji: string })[]>`
          SELECT * FROM (
            SELECT DISTINCT ON (pa.achievement_id)
              pa.*,
              ad.name,
              ad.description,
              ad.emoji
            FROM player_achievements pa
            JOIN achievement_definitions ad ON ad.id = pa.achievement_id
            WHERE pa.player_id = ${playerId}
            ORDER BY pa.achievement_id, pa.unlocked_at DESC
          ) latest_achievements
          ORDER BY unlocked_at DESC
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
        WHERE pa.player_id = ${playerId} AND pa.group_id = ${groupId}
        ORDER BY pa.unlocked_at DESC
      `;
    },

    async listHolders(groupId: string, achievementId: string): Promise<AchievementHolderRow[]> {
      return sql<AchievementHolderRow[]>`
        SELECT
          pa.*,
          p.display_name,
          m.match_type,
          m.winner_id AS match_winner_id,
          m.loser_id AS match_loser_id,
          m.winner_score AS match_winner_score,
          m.loser_score AS match_loser_score,
          m.set_scores AS match_set_scores,
          winner.display_name AS winner_name,
          loser.display_name AS loser_name,
          tournament.name AS tournament_name,
          season.name AS season_name
        FROM player_achievements pa
        JOIN players p ON p.id = pa.player_id
        LEFT JOIN matches m
          ON m.id = pa.match_id
          AND m.group_id = pa.group_id
        LEFT JOIN players winner ON winner.id = m.winner_id
        LEFT JOIN players loser ON loser.id = m.loser_id
        LEFT JOIN tournaments tournament
          ON tournament.id = pa.tournament_id
          AND tournament.group_id = pa.group_id
        LEFT JOIN seasons season
          ON season.id = pa.season_id
          AND season.group_id = pa.group_id
        WHERE pa.group_id = ${groupId}
          AND pa.achievement_id = ${achievementId}
        ORDER BY pa.unlocked_at DESC
      `;
    },

    async countGroupPlayers(groupId: string): Promise<number> {
      const rows = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM group_members
        WHERE group_id = ${groupId}
      `;
      return rows[0]?.count ?? 0;
    },

    async deleteByMatchId(matchId: string): Promise<void> {
      await sql`DELETE FROM player_achievements WHERE match_id = ${matchId}`;
    },
  };
}
