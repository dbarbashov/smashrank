import type { SmashRankContext } from "../context.js";

export async function startCommand(ctx: SmashRankContext): Promise<void> {
  // Player is already created by auto-register middleware
  if (ctx.player.games_played > 0) {
    await ctx.reply(ctx.t("start.already_registered"));
  } else {
    await ctx.reply(ctx.t("start.welcome"));
  }
}
