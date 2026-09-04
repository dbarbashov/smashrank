import type { SqlLike } from "../sql-type.js";
import type {
  AchievementDefinition,
  AchievementDefinitionWithCount,
  AchievementHolderRow,
  PlayerAchievement,
  AchievementExclusivity,
} from "../types.js";
import { evaluateMetaAchievements } from "@smashrank/core";

export interface AchievementAward {
  playerId: string;
  achievementId: string;
}

export type AchievementAwardSource =
  | { type: "match"; id: string }
  | { type: "tournament"; id: string }
  | { type: "season"; id: string }
  | { type: "meta"; context: Record<string, unknown> }
  | null;

export function achievementQueries(sql: SqlLike) {
  return {
    async listDefinitions(): Promise<AchievementDefinition[]> {
      return sql<AchievementDefinition[]>`
        SELECT id, name, description, emoji, category, kind, sort_order
        FROM achievement_definitions
        ORDER BY
          CASE category
            WHEN 'match' THEN 1 WHEN 'rating' THEN 2 WHEN 'opponents' THEN 3
            WHEN 'activity' THEN 4 WHEN 'doubles' THEN 5 WHEN 'tournaments' THEN 6
            WHEN 'shame' THEN 7 WHEN 'meta' THEN 8 ELSE 99
          END,
          sort_order,
          id
      `;
    },

    async listDefinitionsWithHolderCounts(
      groupId: string,
    ): Promise<AchievementDefinitionWithCount[]> {
      return sql<AchievementDefinitionWithCount[]>`
        SELECT
          ad.id, ad.name, ad.description, ad.emoji, ad.category, ad.kind, ad.sort_order,
          COUNT(pa.id)::int AS holder_count
        FROM achievement_definitions ad
        LEFT JOIN player_achievements pa
          ON pa.achievement_id = ad.id
          AND pa.group_id = ${groupId}
        GROUP BY ad.id
        ORDER BY
          CASE ad.category
            WHEN 'match' THEN 1 WHEN 'rating' THEN 2 WHEN 'opponents' THEN 3
            WHEN 'activity' THEN 4 WHEN 'doubles' THEN 5 WHEN 'tournaments' THEN 6
            WHEN 'shame' THEN 7 WHEN 'meta' THEN 8 ELSE 99
          END,
          ad.sort_order,
          ad.id
      `;
    },

    async getDefinition(achievementId: string): Promise<AchievementDefinition | undefined> {
      const rows = await sql<AchievementDefinition[]>`
        SELECT id, name, description, emoji, category, kind, sort_order
        FROM achievement_definitions
        WHERE id = ${achievementId}
        LIMIT 1
      `;
      return rows[0];
    },

    async listRecent(
      groupId: string,
      limit: number = 10,
      matchType?: string,
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
        LEFT JOIN matches m ON m.id = pa.match_id
        WHERE pa.group_id = ${groupId}
          AND (
            ${matchType ?? null}::text IS NULL
            OR pa.match_id IS NULL
            OR m.match_type = ${matchType ?? null}
          )
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

    async awardMany(
      groupId: string,
      items: AchievementAward[],
      source: AchievementAwardSource,
      unlockedAt: Date = new Date(),
    ): Promise<PlayerAchievement[]> {
      if (items.length === 0) return [];
      const sourceType = source?.type ?? null;
      const sourceId = source && source.type !== "meta" ? source.id : null;
      const metaContext = source?.type === "meta" ? source.context : null;
      return sql<PlayerAchievement[]>`
        SELECT *
        FROM award_achievements(
          ${groupId}::uuid,
          ${sql.json(items.map((item) => ({
            player_id: item.playerId,
            achievement_id: item.achievementId,
          })))}::jsonb,
          ${sourceType}::text,
          ${sourceId}::uuid,
          ${metaContext ? sql.json(metaContext as Record<string, string | number | boolean | null>) : null}::jsonb,
          ${unlockedAt}
        )
      `;
    },

    async awardWithMeta(
      groupId: string,
      items: AchievementAward[],
      source: AchievementAwardSource,
      unlockedAt: Date = new Date(),
    ): Promise<AchievementAward[]> {
      const primaryRows = await this.awardMany(groupId, items, source, unlockedAt);
      if (primaryRows.length === 0) return [];

      const primary = primaryRows.map((row) => ({
        playerId: row.player_id,
        achievementId: row.achievement_id,
      }));
      const metaRows: PlayerAchievement[] = [];
      for (const playerId of new Set(primary.map((item) => item.playerId))) {
        const playerPrimary = primary.filter((item) => item.playerId === playerId);
        const owned = await this.getPlayerAchievementIds(playerId, groupId);
        const metaCandidates = evaluateMetaAchievements({
          playerId,
          primaryUnlockIds: playerPrimary.map((item) => item.achievementId),
          ownedAchievementIds: owned,
          eventIsMatch: source?.type === "match",
        });
        const rootContext = source?.type === "meta"
          ? { ...source.context, trigger_achievement_ids: playerPrimary.map((item) => item.achievementId) }
          : source
          ? { [`${source.type}_id`]: source.id, trigger_achievement_ids: playerPrimary.map((item) => item.achievementId) }
          : { trigger_achievement_ids: playerPrimary.map((item) => item.achievementId) };
        metaRows.push(...await this.awardMany(groupId, metaCandidates, {
          type: "meta",
          context: rootContext,
        }, unlockedAt));
      }
      return [
        ...primary,
        ...metaRows.map((row) => ({ playerId: row.player_id, achievementId: row.achievement_id })),
      ];
    },

    /** Compatibility wrapper for older match call sites. */
    async unlockMany(
      groupId: string,
      items: { playerId: string; achievementId: string; matchId: string }[],
    ): Promise<PlayerAchievement[]> {
      const matchId = items[0]?.matchId;
      if (!matchId) return [];
      return this.awardMany(
        groupId,
        items.map(({ playerId, achievementId }) => ({ playerId, achievementId })),
        { type: "match", id: matchId },
      );
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

    async deleteByMatchId(matchId: string): Promise<number> {
      const rows = await sql<{ deleted: number }[]>`
        SELECT delete_achievements_by_match(${matchId}::uuid)::int AS deleted
      `;
      return rows[0]?.deleted ?? 0;
    },

    async listMaturedExclusivity(groupId: string, now: Date = new Date()): Promise<AchievementExclusivity[]> {
      return sql<AchievementExclusivity[]>`
        SELECT ae.*
        FROM achievement_exclusivity ae
        JOIN achievement_definitions ad ON ad.id = ae.achievement_id
        WHERE ae.sole_player_id IS NOT NULL
          AND ae.group_id = ${groupId}
          AND ae.unique_since <= ${now} - INTERVAL '30 days'
          AND ad.kind != 'meta'
        ORDER BY ae.unique_since, ae.achievement_id
      `;
    },

    async listCompletedDayLastMatches(
      groupId: string,
      now: Date = new Date(),
    ): Promise<{ played_at: Date; participant_ids: string[] }[]> {
      return sql<{ played_at: Date; participant_ids: string[] }[]>`
        SELECT played_at, ARRAY_REMOVE(ARRAY[
          winner_id, winner_partner_id, loser_id, loser_partner_id
        ], NULL) AS participant_ids
        FROM (
          SELECT DISTINCT ON ((played_at AT TIME ZONE 'Europe/Moscow')::date) *
          FROM matches
          WHERE group_id = ${groupId}
            AND (played_at AT TIME ZONE 'Europe/Moscow')::date
              < (${now} AT TIME ZONE 'Europe/Moscow')::date
          ORDER BY (played_at AT TIME ZONE 'Europe/Moscow')::date, played_at DESC, id DESC
        ) last_matches
        ORDER BY played_at
      `;
    },
  };
}
