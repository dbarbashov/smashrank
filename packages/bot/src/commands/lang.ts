import { getConnection, playerQueries } from "@smashrank/db";
import { getT } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";

const SUPPORTED_LANGS = new Set(["en", "ru"]);

export async function langCommand(ctx: SmashRankContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const arg = text.replace(/^\/lang\s*/, "").trim().toLowerCase();

  if (!arg || !SUPPORTED_LANGS.has(arg)) {
    await ctx.reply(ctx.t("lang.invalid"));
    return;
  }

  const sql = getConnection();
  const players = playerQueries(sql);
  await players.updateLanguage(ctx.player.id, arg);

  // Respond in the NEW language
  const t = getT(arg);
  await ctx.reply(t("lang.changed"));
}
