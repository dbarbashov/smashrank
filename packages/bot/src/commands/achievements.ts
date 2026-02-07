import {
  getConnection,
  playerQueries,
  achievementQueries,
} from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function achievementsCommand(ctx: SmashRankContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const mentionMatch = text.match(/@(\w+)/);

  const sql = getConnection();
  const players = playerQueries(sql);
  const achievements = achievementQueries(sql);

  let target = ctx.player;
  if (mentionMatch) {
    const found = await players.findByUsername(mentionMatch[1]);
    if (!found) {
      await ctx.reply(ctx.t("game.player_not_found", { username: mentionMatch[1] }));
      return;
    }
    target = found;
  }

  const playerAchievements = await achievements.getPlayerAchievements(target.id);

  if (playerAchievements.length === 0) {
    await ctx.reply(ctx.t("achievement.none", { name: target.display_name }));
    return;
  }

  const lines = [
    ctx.t("achievement.title", { name: target.display_name, count: playerAchievements.length }),
    "",
  ];

  for (const a of playerAchievements) {
    const name = ctx.t(`achievement.${a.achievement_id}`) || a.name;
    const desc = ctx.t(`achievement.desc.${a.achievement_id}`) || a.description;
    lines.push(`${a.emoji} ${name} — ${desc}`);
  }

  await ctx.reply(lines.join("\n"));
}
