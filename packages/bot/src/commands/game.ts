import type postgres from "postgres";
import {
  getConnection,
  playerQueries,
  matchQueries,
} from "@smashrank/db";
import {
  parseGameCommand,
  calculateElo,
  updateStreak,
} from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { ensureActiveSeason } from "../helpers/ensure-season.js";

export async function gameCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text;
  if (!text) return;

  const reporterUsername = ctx.from?.username;
  const result = parseGameCommand(text, reporterUsername);

  if (!result.ok) {
    const errorKey = `error.${result.error}`;
    await ctx.reply(ctx.t(errorKey));
    return;
  }

  const { data } = result;
  const sql = getConnection();
  const players = playerQueries(sql);
  const matches = matchQueries(sql);

  // Find opponent
  const opponent = await players.findByUsername(data.opponentUsername);
  if (!opponent) {
    await ctx.reply(ctx.t("game.player_not_found", { username: data.opponentUsername }));
    return;
  }

  // Determine winner and loser
  const winner = data.winner === "reporter" ? ctx.player : opponent;
  const loser = data.winner === "reporter" ? opponent : ctx.player;

  // Cooldown check
  const recent = await matches.findRecentBetweenPlayers(winner.id, loser.id);
  if (recent) {
    await ctx.reply(ctx.t("game.cooldown"));
    return;
  }

  // Ensure active season
  const season = await ensureActiveSeason(ctx.group.id);

  // Calculate ELO
  const eloResult = calculateElo({
    winnerRating: winner.elo_rating,
    loserRating: loser.elo_rating,
    winnerGamesPlayed: winner.games_played,
    loserGamesPlayed: loser.games_played,
  });

  // Calculate streaks
  const winnerStreak = updateStreak(winner.current_streak, winner.best_streak, true);
  const loserStreak = updateStreak(loser.current_streak, loser.best_streak, false);

  // Persist everything in a transaction
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txPlayers = playerQueries(txSql);
    const txMatches = matchQueries(txSql);

    await txMatches.create({
      match_type: "singles",
      season_id: season.id,
      group_id: ctx.group!.id,
      winner_id: winner.id,
      loser_id: loser.id,
      winner_score: data.winnerSets,
      loser_score: data.loserSets,
      set_scores: data.setScores,
      elo_before_winner: winner.elo_rating,
      elo_before_loser: loser.elo_rating,
      elo_change: eloResult.change,
      reported_by: ctx.player.id,
    });

    await txPlayers.updateElo(
      winner.id,
      eloResult.winnerNewRating,
      true,
      winnerStreak.currentStreak,
      winnerStreak.bestStreak,
    );

    await txPlayers.updateElo(
      loser.id,
      eloResult.loserNewRating,
      false,
      loserStreak.currentStreak,
      loserStreak.bestStreak,
    );
  });

  // Build response
  const setScoresStr = data.setScores
    ? data.setScores.map((s) => `${s.w}-${s.l}`).join(", ")
    : null;

  const templateKey = setScoresStr ? "game.result_with_sets" : "game.result";
  const message = ctx.t(templateKey, {
    winner: winner.display_name,
    loser: loser.display_name,
    winnerSets: data.winnerSets,
    loserSets: data.loserSets,
    setScores: setScoresStr,
    eloBeforeWinner: winner.elo_rating,
    eloAfterWinner: eloResult.winnerNewRating,
    eloBeforeLoser: loser.elo_rating,
    eloAfterLoser: eloResult.loserNewRating,
    change: eloResult.change,
  });

  await ctx.reply(message);
}
