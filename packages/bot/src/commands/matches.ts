import { getConnection, matchQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function matchesCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const matches = matchQueries(sql);
  const recent = await matches.listByGroup(ctx.group.id, { limit: 10 });

  if (recent.length === 0) {
    await ctx.reply(ctx.t("matches_cmd.empty"));
    return;
  }

  const lines = [ctx.t("matches_cmd.title"), ""];

  for (const m of recent) {
    const isDoubles = m.match_type === "doubles";
    let winner = m.winner_name;
    let loser = m.loser_name;
    if (isDoubles && m.winner_partner_name) {
      winner += ` & ${m.winner_partner_name}`;
    }
    if (isDoubles && m.loser_partner_name) {
      loser += ` & ${m.loser_partner_name}`;
    }

    const type = isDoubles ? ctx.t("matches_cmd.doubles") : ctx.t("matches_cmd.singles");
    const score = `${m.winner_score}-${m.loser_score}`;
    const date = new Date(m.played_at).toLocaleDateString();
    const beat = isDoubles ? ctx.t("matches_cmd.beat_doubles") : ctx.t("matches_cmd.beat");
    lines.push(`[${type}] ${winner} ${beat} ${loser} ${score} (+${m.elo_change}) — ${date}`);
  }

  await ctx.reply(lines.join("\n"));
}
