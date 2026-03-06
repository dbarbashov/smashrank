import { getConnection, groupQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

/**
 * Checks if a player is opted out. If so, replies with an error message.
 * Returns true if opted out (caller should abort), false if not.
 */
export async function checkOptOut(
  ctx: SmashRankContext,
  groupId: string,
  playerId: string,
  playerName: string,
  isSelf: boolean,
): Promise<boolean> {
  const sql = getConnection();
  const groups = groupQueries(sql);
  const optedOut = await groups.isOptedOut(groupId, playerId);
  if (!optedOut) return false;

  if (isSelf) {
    await ctx.reply(ctx.t("error.self_opted_out"));
  } else {
    await ctx.reply(ctx.t("error.player_opted_out", { name: playerName }));
  }
  return true;
}
