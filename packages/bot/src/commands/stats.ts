import {
  getConnection,
  playerQueries,
  matchQueries,
  achievementQueries,
} from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function statsCommand(ctx: SmashRankContext): Promise<void> {
  const sql = getConnection();
  const players = playerQueries(sql);
  const matches = matchQueries(sql);
  const achievements = achievementQueries(sql);

  // Determine target player: mentioned user or self
  const text = ctx.message?.text ?? "";
  const mentionMatch = text.match(/@(\w+)/);

  let target = ctx.player;
  if (mentionMatch) {
    const found = await players.findByUsername(mentionMatch[1]);
    if (!found) {
      await ctx.reply(ctx.t("game.player_not_found", { username: mentionMatch[1] }));
      return;
    }
    target = found;
  }

  if (target.games_played === 0) {
    await ctx.reply(ctx.t("stats.no_games", { name: target.display_name }));
    return;
  }

  const winrate = Math.round((target.wins / target.games_played) * 100);

  // Get rank if in a group
  let rank = "?";
  if (ctx.group) {
    const stats = await matches.getPlayerStats(target.id, ctx.group.id);
    if (stats) {
      rank = String(stats.rank);
    }
  }

  const playerAchievements = await achievements.getPlayerAchievementIds(target.id);

  const lines = [
    `\u{1F4CA} ${ctx.t("stats.title", { name: target.display_name })}`,
    "",
    ctx.t("stats.elo", { elo: target.elo_rating, rank }),
    ctx.t("stats.record", { wins: target.wins, losses: target.losses, winrate }),
    ctx.t("stats.games", { games: target.games_played }),
    ctx.t("stats.streak", { streak: target.current_streak }),
    ctx.t("stats.best_streak", { bestStreak: target.best_streak }),
    ctx.t("stats.achievements", { count: playerAchievements.length }),
  ];

  // Recent matches
  const recent = await matches.getPlayerRecentMatches(target.id);
  if (recent.length > 0) {
    lines.push("");
    lines.push(ctx.t("stats.recent"));
    for (const m of recent) {
      const isWinner = m.winner_id === target.id;
      const result = isWinner ? ctx.t("stats.win_short") : ctx.t("stats.loss_short");
      const opponent = isWinner ? m.loser_name : m.winner_name;
      const change = isWinner ? `+${m.elo_change}` : `-${m.elo_change}`;
      lines.push(`  ${result} vs ${opponent} (${change})`);
    }
  }

  await ctx.reply(lines.join("\n"));
}
