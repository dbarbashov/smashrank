import { getConnection, achievementQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function listAchievementsCommand(ctx: SmashRankContext): Promise<void> {
  const sql = getConnection();
  const definitions = await achievementQueries(sql).listDefinitions();

  const lines = [ctx.t("achievement.list_title"), ""];

  for (const d of definitions) {
    const name = ctx.t(`achievement.${d.id}`) || d.name;
    const desc = ctx.t(`achievement.desc.${d.id}`) || d.description;
    lines.push(`${d.emoji} ${name} — ${desc}`);
  }

  await ctx.reply(lines.join("\n"));
}
