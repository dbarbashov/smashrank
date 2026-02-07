import type { SmashRankContext } from "../context.js";

export async function webCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const baseUrl = process.env.WEB_URL;
  if (!baseUrl) {
    await ctx.reply(ctx.t("web.not_configured"));
    return;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/g/${ctx.group.slug}`;
  await ctx.reply(ctx.t("web.link", { url }), { parse_mode: "HTML" });
}
