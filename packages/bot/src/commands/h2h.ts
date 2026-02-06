import {
  getConnection,
  playerQueries,
  matchQueries,
} from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function h2hCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text ?? "";
  const mentionMatch = text.match(/@(\w+)/);
  if (!mentionMatch) {
    await ctx.reply(ctx.t("h2h.usage"));
    return;
  }

  const opponentUsername = mentionMatch[1];
  const sql = getConnection();
  const players = playerQueries(sql);
  const matches = matchQueries(sql);

  const opponent = await players.findByUsername(opponentUsername);
  if (!opponent) {
    await ctx.reply(ctx.t("game.player_not_found", { username: opponentUsername }));
    return;
  }

  if (opponent.id === ctx.player.id) {
    await ctx.reply(ctx.t("error.self_play"));
    return;
  }

  const h2h = await matches.getH2H(ctx.player.id, opponent.id, ctx.group.id);

  if (h2h.totalMatches === 0) {
    await ctx.reply(ctx.t("h2h.no_matches", {
      player: ctx.player.display_name,
      opponent: opponent.display_name,
    }));
    return;
  }

  let msg = ctx.t("h2h.title", {
    player: ctx.player.display_name,
    opponent: opponent.display_name,
  }) + "\n";

  msg += ctx.t("h2h.record", {
    playerWins: h2h.winsA,
    opponentWins: h2h.winsB,
    total: h2h.totalMatches,
  }) + "\n";

  if (h2h.recent.length > 0) {
    msg += "\n" + ctx.t("h2h.recent") + "\n";
    for (const m of h2h.recent) {
      const sets = typeof m.set_scores === "string"
        ? JSON.parse(m.set_scores) as { w: number; l: number }[]
        : m.set_scores;
      const score = sets
        ? sets.map((s) => `${s.w}-${s.l}`).join(", ")
        : `${m.winner_score}-${m.loser_score}`;
      msg += `  ${m.winner_name} > ${m.loser_name} (${score})\n`;
    }
  }

  await ctx.reply(msg.trimEnd());
}
