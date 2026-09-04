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

    const setsInMatch = match.winner_score + match.loser_score;
    if (match.match_type === "doubles" && match.winner_partner_id && match.loser_partner_id) {
      const participantIds = [match.winner_id, match.winner_partner_id, match.loser_id, match.loser_partner_id];
      const streaks = await Promise.all(participantIds.map((id) => txMatches.recalculateDoublesStreaks(id, groupId)));
      const ratings = [
        match.elo_before_winner,
        match.elo_before_winner_partner ?? match.elo_before_winner,
        match.elo_before_loser,
        match.elo_before_loser_partner ?? match.elo_before_loser,
      ];
      for (let index = 0; index < participantIds.length; index += 1) {
        const won = index < 2;
        await txSql`
          UPDATE group_members SET
            doubles_elo_rating = ${ratings[index]},
            doubles_games_played = GREATEST(0, doubles_games_played - 1),
            doubles_wins = GREATEST(0, doubles_wins - ${won ? 1 : 0}),
            doubles_losses = GREATEST(0, doubles_losses - ${won ? 0 : 1}),
            doubles_current_streak = ${streaks[index].currentStreak},
            doubles_best_streak = ${streaks[index].bestStreak},
            sets_played = GREATEST(0, sets_played - ${setsInMatch})
          WHERE group_id = ${groupId} AND player_id = ${participantIds[index]}
        `;
      }
    } else {
      const [winnerStreaks, loserStreaks] = await Promise.all([
        txMatches.recalculateStreaks(match.winner_id, groupId),
        txMatches.recalculateStreaks(match.loser_id, groupId),
      ]);
      const isDraw = match.match_type === "tournament" && match.winner_score === match.loser_score;
      await txSql`
        UPDATE group_members SET
          elo_rating = ${match.elo_before_winner},
          games_played = GREATEST(0, games_played - 1),
          wins = GREATEST(0, wins - ${isDraw ? 0 : 1}),
          current_streak = ${winnerStreaks.currentStreak},
          best_streak = ${winnerStreaks.bestStreak},
          sets_played = GREATEST(0, sets_played - ${setsInMatch})
        WHERE group_id = ${groupId} AND player_id = ${match.winner_id}
      `;
      await txSql`
        UPDATE group_members SET
          elo_rating = ${match.elo_before_loser},
          games_played = GREATEST(0, games_played - 1),
          losses = GREATEST(0, losses - ${isDraw ? 0 : 1}),
          current_streak = ${loserStreaks.currentStreak},
          best_streak = ${loserStreaks.bestStreak},
          sets_played = GREATEST(0, sets_played - ${setsInMatch})
        WHERE group_id = ${groupId} AND player_id = ${match.loser_id}
      `;
      if (match.tournament_id) {
        await txSql`
          UPDATE tournament_standings SET
            points = GREATEST(0, points - ${isDraw ? 1 : 3}),
            wins = GREATEST(0, wins - ${isDraw ? 0 : 1}),
            draws = GREATEST(0, draws - ${isDraw ? 1 : 0}),
            sets_won = GREATEST(0, sets_won - ${match.winner_score}),
            sets_lost = GREATEST(0, sets_lost - ${match.loser_score})
          WHERE tournament_id = ${match.tournament_id} AND player_id = ${match.winner_id}
        `;
        await txSql`
          UPDATE tournament_standings SET
            points = GREATEST(0, points - ${isDraw ? 1 : 0}),
            losses = GREATEST(0, losses - ${isDraw ? 0 : 1}),
            draws = GREATEST(0, draws - ${isDraw ? 1 : 0}),
            sets_won = GREATEST(0, sets_won - ${match.loser_score}),
            sets_lost = GREATEST(0, sets_lost - ${match.winner_score})
          WHERE tournament_id = ${match.tournament_id} AND player_id = ${match.loser_id}
        `;
        await txSql`
          UPDATE tournaments SET status = 'active', completed_at = NULL
          WHERE id = ${match.tournament_id} AND status = 'completed'
        `;
      }
    }
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
