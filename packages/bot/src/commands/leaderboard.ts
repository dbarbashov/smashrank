import { getConnection, matchQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function leaderboardCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const matches = matchQueries(sql);

  const rows = await matches.getLeaderboard(ctx.group.id);

  if (rows.length === 0) {
    await ctx.reply(ctx.t("leaderboard.empty"));
    return;
  }

  const title = ctx.t("leaderboard.title");
  const lines = rows.map((row, i) =>
    ctx.t("leaderboard.row", {
      rank: i + 1,
      name: row.display_name,
      elo: row.elo_rating,
      wins: row.wins,
      losses: row.losses,
    }),
  );

  await ctx.reply(`🏓 ${title}\n\n${lines.join("\n")}`);
}
