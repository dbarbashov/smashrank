import { getConnection, groupQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function optoutCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const groups = groupQueries(sql);

  const alreadyOptedOut = await groups.isOptedOut(ctx.group.id, ctx.player.id);
  if (alreadyOptedOut) {
    await ctx.reply(ctx.t("optout.already"));
    return;
  }

  await groups.setOptedOut(ctx.group.id, ctx.player.id, true);
  await ctx.reply(ctx.t("optout.success"));
}

export async function optinCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const groups = groupQueries(sql);

  const isOptedOut = await groups.isOptedOut(ctx.group.id, ctx.player.id);
  if (!isOptedOut) {
    await ctx.reply(ctx.t("optin.already"));
    return;
  }

  await groups.setOptedOut(ctx.group.id, ctx.player.id, false);
  await ctx.reply(ctx.t("optin.success"));
}
