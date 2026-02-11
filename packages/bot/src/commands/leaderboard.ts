import { getConnection, matchQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function leaderboardCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text ?? "";
  const arg = text.replace(/^\/leaderboard\s*/, "").trim().toLowerCase();
  const isDoubles = arg === "doubles";

  const sql = getConnection();
  const matches = matchQueries(sql);

  const rows = await matches.getLeaderboard(ctx.group.id, 20, isDoubles ? "doubles" : undefined);

  if (rows.length === 0) {
    await ctx.reply(ctx.t("leaderboard.empty"));
    return;
  }

  const title = isDoubles ? ctx.t("leaderboard.doubles_title") : ctx.t("leaderboard.title");
  const lines = rows.map((row, i) =>
    ctx.t("leaderboard.row", {
      rank: i + 1,
      name: row.display_name,
      elo: row.elo_rating,
      wins: row.wins,
      losses: row.losses,
    }),
  );

  await ctx.reply(`\u{1F3D3} ${title}\n\n${lines.join("\n")}`);
}
