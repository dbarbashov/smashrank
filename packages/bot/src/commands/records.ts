import { getConnection, recordQueries } from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function recordsCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const records = await recordQueries(sql).getGroupRecords(ctx.group.id);

  const entries: string[] = [];

  if (records.highestElo) {
    entries.push(ctx.t("records.highest_elo") + "\n" + ctx.t("records.holder", {
      name: records.highestElo.playerName,
      value: records.highestElo.value,
    }));
  }

  if (records.longestStreak) {
    entries.push(ctx.t("records.longest_streak") + "\n" + ctx.t("records.holder", {
      name: records.longestStreak.playerName,
      value: records.longestStreak.value,
    }));
  }

  if (records.biggestUpset) {
    const upsetDetail = records.biggestUpset.detail
      ? ` (${ctx.t("records.upset_detail", { loser: records.biggestUpset.detail })})`
      : "";
    entries.push(ctx.t("records.biggest_upset") + "\n" + ctx.t("records.holder", {
      name: records.biggestUpset.playerName,
      value: records.biggestUpset.value,
    }) + upsetDetail);
  }

  if (records.mostMatchesInDay) {
    entries.push(ctx.t("records.most_matches_day") + "\n" + ctx.t("records.holder", {
      name: records.mostMatchesInDay.playerName,
      value: records.mostMatchesInDay.value,
    }));
  }

  if (records.highestEloGain) {
    entries.push(ctx.t("records.highest_elo_gain") + "\n" + ctx.t("records.holder", {
      name: records.highestEloGain.playerName,
      value: `+${records.highestEloGain.value}`,
    }));
  }

  if (records.mostGamesPlayed) {
    entries.push(ctx.t("records.most_games") + "\n" + ctx.t("records.holder", {
      name: records.mostGamesPlayed.playerName,
      value: records.mostGamesPlayed.value,
    }));
  }

  if (entries.length === 0) {
    await ctx.reply(ctx.t("records.empty"));
    return;
  }

  const message = ctx.t("records.title") + "\n\n" + entries.join("\n\n");
  await ctx.reply(message);
}
