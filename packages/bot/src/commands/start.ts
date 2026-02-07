import {
  getConnection,
  groupQueries,
} from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function startCommand(ctx: SmashRankContext): Promise<void> {
  // Player is already created by auto-register middleware
  // Check if player has played any games in this group
  if (ctx.group) {
    const sql = getConnection();
    const member = await groupQueries(sql).getGroupMember(ctx.group.id, ctx.player.id);
    if (member && member.games_played > 0) {
      await ctx.reply(ctx.t("start.already_registered"));
      return;
    }
  }
  await ctx.reply(ctx.t("start.welcome"));
}
