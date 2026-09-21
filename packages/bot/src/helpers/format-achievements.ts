import { ACHIEVEMENT_BY_ID, type AchievementUnlock } from "@smashrank/core";
import type { Player } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export function formatAchievementUnlocks(
  achievements: AchievementUnlock[],
  winner: Player,
  loser: Player,
  ctx: SmashRankContext,
): string | null {
  if (achievements.length === 0) return null;

  const lines: string[] = [];
  for (const a of achievements) {
    const player = a.playerId === winner.id ? winner : loser;
    const emoji = ACHIEVEMENT_BY_ID.get(a.achievementId)?.emoji ?? "\u{1F3C5}";
    const name = ctx.t(`achievement.${a.achievementId}`);
    lines.push(`${emoji} ${player.display_name}: ${name}`);
  }

  return ctx.t("achievement.unlocked") + "\n" + lines.join("\n");
}
