import type { SmashRankContext } from "../context.js";

export async function helpCommand(ctx: SmashRankContext): Promise<void> {
  await ctx.reply(ctx.t("help.text"));
}
