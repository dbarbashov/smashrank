import type { AchievementUnlock } from "@smashrank/core";
import type { Player } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

const ACHIEVEMENT_EMOJI: Record<string, string> = {
  first_blood: "\u{1FA78}",
  on_fire: "\u{1F525}",
  unstoppable: "\u{1F480}",
  giant_killer: "\u{1F5E1}\uFE0F",
  iron_man: "\u{1F9BE}",
  centurion: "\u{1F4AF}",
  top_dog: "\u{1F451}",
  comeback_kid: "\u{1F504}",
  rivalry: "\u2694\uFE0F",
  perfect_game: "\u2728",
  heartbreaker: "\u{1F494}",
  newcomer_threat: "\u{1F31F}",
  tournament_champion: "\u{1F3C6}",
  tournament_undefeated: "\u{1F6E1}\uFE0F",
  tournament_ironman: "\u2699\uFE0F",
  draw_master: "\u{1F91D}",
};

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
    const emoji = ACHIEVEMENT_EMOJI[a.achievementId] ?? "\u{1F3C5}";
    const name = ctx.t(`achievement.${a.achievementId}`);
    lines.push(`${emoji} ${player.display_name}: ${name}`);
  }

  return ctx.t("achievement.unlocked") + "\n" + lines.join("\n");
}
