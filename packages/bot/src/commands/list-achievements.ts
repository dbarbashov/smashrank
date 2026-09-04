import { getConnection, achievementQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";
import { ACHIEVEMENT_CATEGORIES } from "@smashrank/core";

export async function listAchievementsCommand(ctx: SmashRankContext): Promise<void> {
  const sql = getConnection();
  const definitions = await achievementQueries(sql).listDefinitions();

  for (const category of ACHIEVEMENT_CATEGORIES) {
    const categoryDefinitions = definitions.filter((definition) => definition.category === category);
    if (categoryDefinitions.length === 0) continue;
    const lines = [ctx.t(`achievement.category.${category}`), ""];
    for (const definition of categoryDefinitions) {
      const name = ctx.t(`achievement.${definition.id}`) || definition.name;
      const desc = ctx.t(`achievement.desc.${definition.id}`) || definition.description;
      lines.push(`${definition.emoji} ${name} — ${desc}`);
    }
    await ctx.reply(lines.join("\n"));
  }
}
