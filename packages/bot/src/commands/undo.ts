import type postgres from "postgres";
import {
  getConnection,
  playerQueries,
  matchQueries,
  achievementQueries,
} from "@smashrank/db";
import type { SmashRankContext } from "../context.js";

export async function undoCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const matches = matchQueries(sql);

  // Find last match reported by this player within 5 minutes
  const match = await matches.findLastByReporter(ctx.player.id);
  if (!match) {
    await ctx.reply(ctx.t("undo.no_match"));
    return;
  }

  const groupId = match.group_id;

  // Reverse everything in a transaction
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txMatches = matchQueries(txSql);
    const txAchievements = achievementQueries(txSql);

    // Delete achievements earned from this match
    await txAchievements.deleteByMatchId(match.id);

    // Delete the match first so recalculation excludes it
    await txMatches.deleteById(match.id);

    // Recalculate streaks from remaining match history (group-scoped)
    const winnerStreaks = await txMatches.recalculateStreaks(match.winner_id, groupId);
    const loserStreaks = await txMatches.recalculateStreaks(match.loser_id, groupId);

    // Restore winner's stats on group_members
    await txSql`
      UPDATE group_members SET
        elo_rating = ${match.elo_before_winner},
        games_played = games_played - 1,
        wins = wins - 1,
        current_streak = ${winnerStreaks.currentStreak},
        best_streak = ${winnerStreaks.bestStreak}
      WHERE group_id = ${groupId} AND player_id = ${match.winner_id}
    `;

    // Restore loser's stats on group_members
    await txSql`
      UPDATE group_members SET
        elo_rating = ${match.elo_before_loser},
        games_played = games_played - 1,
        losses = losses - 1,
        current_streak = ${loserStreaks.currentStreak},
        best_streak = ${loserStreaks.bestStreak}
      WHERE group_id = ${groupId} AND player_id = ${match.loser_id}
    `;
  });

  // Get display names for the response
  const players = playerQueries(sql);
  const winner = await players.findById(match.winner_id);
  const loser = await players.findById(match.loser_id);

  await ctx.reply(ctx.t("undo.success", {
    winner: winner?.display_name ?? "?",
    loser: loser?.display_name ?? "?",
  }));
}
