import {
  getConnection,
  seasonQueries,
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
