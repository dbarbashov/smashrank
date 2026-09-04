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
    const [topSetsPlayer, group] = await Promise.all([
      groups.getTopSetsPlayer(groupId),
      groups.findById(groupId),
    ]);
    if (topSetsPlayer && group?.settings?.achievements !== false) {
      const achievements = achievementQueries(sql);
      await achievements.awardWithMeta(
        groupId,
        [{ playerId: topSetsPlayer.player_id, achievementId: "party_worker" }],
        { type: "season", id: existing.id },
        new Date(existing.end_date),
      );
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
