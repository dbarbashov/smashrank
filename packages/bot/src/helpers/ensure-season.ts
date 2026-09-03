import {
  getConnection,
  seasonQueries,
  groupQueries,
  achievementQueries,
  type Season,
} from "@smashrank/db";
import { getSeasonForDate, isSeasonExpired } from "@smashrank/core";

export async function ensureActiveSeason(groupId: string): Promise<Season> {
  const sql = getConnection();
  const seasons = seasonQueries(sql);

  const existing = await seasons.findActive(groupId);

  if (existing && !isSeasonExpired(existing.end_date)) {
    return existing;
  }

  // Need to transition or create a new season
  if (existing) {
    // Award "party_worker" achievement before snapshot/reset
    const groups = groupQueries(sql);
    const topSetsPlayer = await groups.getTopSetsPlayer(groupId);
    if (topSetsPlayer) {
      const achievements = achievementQueries(sql);
      const existingIds = await achievements.getPlayerAchievementIds(topSetsPlayer.player_id, groupId);
      if (!existingIds.includes("party_worker")) {
        await sql`
          INSERT INTO player_achievements (group_id, player_id, achievement_id, season_id)
          VALUES (${groupId}, ${topSetsPlayer.player_id}, 'party_worker', ${existing.id})
          ON CONFLICT (group_id, player_id, achievement_id) WHERE group_id IS NOT NULL DO NOTHING
        `;
      }
    }

    // Season expired — snapshot and reset
    await seasons.createSnapshot(existing.id, groupId);
    await seasons.deactivate(existing.id);
    await seasons.resetPlayersForGroup(groupId);
  }

  const now = new Date();
  const info = getSeasonForDate(now);
  return seasons.create({
    group_id: groupId,
    name: info.name,
    start_date: info.startDate,
    end_date: info.endDate,
  });
}
