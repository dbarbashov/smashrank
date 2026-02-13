import { getConnection, matchQueries } from "@smashrank/db";
import { getTier } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";

const INACTIVE_DAYS = 14;

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

  const now = Date.now();
  const inactiveCutoff = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

  const title = isDoubles ? ctx.t("leaderboard.doubles_title") : ctx.t("leaderboard.title");
  const lines = rows.map((row, i) => {
    const tier = getTier(row.elo_rating);
    const isInactive = row.last_active
      ? now - new Date(row.last_active).getTime() > inactiveCutoff
      : false;
    const inactiveTag = isInactive ? ` ${ctx.t("leaderboard.inactive")}` : "";
    return ctx.t("leaderboard.row", {
      rank: i + 1,
      name: row.display_name + inactiveTag,
      elo: row.elo_rating,
      wins: row.wins,
      losses: row.losses,
      sets: row.sets_played,
      tier: tier.emoji,
    });
  });

  await ctx.reply(`\u{1F3D3} ${title}\n\n${lines.join("\n")}`);
}
