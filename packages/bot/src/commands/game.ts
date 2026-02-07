import {
  getConnection,
  playerQueries,
  groupQueries,
} from "@smashrank/db";
import {
  parseGameCommand,
  generateMatchCommentary,
} from "@smashrank/core";
import type { MatchCommentaryContext } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { recordMatch } from "../helpers/record-match.js";
import { formatAchievementUnlocks } from "../helpers/format-achievements.js";

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
  const groups = groupQueries(sql);

  // Find opponent
  const opponent = await players.findByUsername(data.opponentUsername);
  if (!opponent) {
    await ctx.reply(ctx.t("game.player_not_found", { username: data.opponentUsername }));
    return;
  }

  // Check opponent is a member of this group
  const opponentIsMember = await groups.isMember(ctx.group.id, opponent.id);
  if (!opponentIsMember) {
    await ctx.reply(ctx.t("game.not_group_member", { username: data.opponentUsername }));
    return;
  }

  // Determine winner and loser
  const winner = data.winner === "reporter" ? ctx.player : opponent;
  const loser = data.winner === "reporter" ? opponent : ctx.player;

  // Orient set scores: match winner's score first (w), loser's score second (l)
  const orientedSetScores = data.setScores
    ? data.setScores.map((s) => {
        const isReporterWinner = data.winner === "reporter";
        return {
          w: isReporterWinner ? s.reporterScore : s.opponentScore,
          l: isReporterWinner ? s.opponentScore : s.reporterScore,
        };
      })
    : null;

  const { eloResult, winnerStreak, newAchievements, winnerMember, loserMember } = await recordMatch({
    group: ctx.group,
    winner,
    loser,
    winnerSets: data.winnerSets,
    loserSets: data.loserSets,
    setScores: orientedSetScores,
    reportedBy: ctx.player.id,
  });

  // Build response — try LLM commentary first, fall back to template
  const setScoresStr = orientedSetScores
    ? orientedSetScores.map((s) => `${s.w}-${s.l}`).join(", ")
    : null;

  const commentaryContext: MatchCommentaryContext = {
    winner: {
      name: winner.display_name,
      elo_before: winnerMember.elo_rating,
      elo_after: eloResult.winnerNewRating,
    },
    loser: {
      name: loser.display_name,
      elo_before: loserMember.elo_rating,
      elo_after: eloResult.loserNewRating,
    },
    set_scores: setScoresStr ?? `${data.winnerSets}-${data.loserSets}`,
    elo_change: eloResult.change,
    is_upset: loserMember.elo_rating > winnerMember.elo_rating,
    elo_gap: Math.abs(winnerMember.elo_rating - loserMember.elo_rating),
    winner_streak: winnerStreak.currentStreak,
    achievements: newAchievements.map((a) => a.achievementId),
  };

  const commentaryEnabled = ctx.group.settings?.commentary !== false;
  const language = ctx.group?.language ?? "en";
  const llmMessage = commentaryEnabled
    ? await generateMatchCommentary(commentaryContext, language)
    : null;

  let message: string;
  if (llmMessage) {
    message = llmMessage;
  } else {
    const templateKey = setScoresStr ? "game.result_with_sets" : "game.result";
    message = ctx.t(templateKey, {
      winner: winner.display_name,
      loser: loser.display_name,
      winnerSets: data.winnerSets,
      loserSets: data.loserSets,
      setScores: setScoresStr,
      eloBeforeWinner: winnerMember.elo_rating,
      eloAfterWinner: eloResult.winnerNewRating,
      eloBeforeLoser: loserMember.elo_rating,
      eloAfterLoser: eloResult.loserNewRating,
      change: eloResult.change,
    });
  }

  const achievementText = formatAchievementUnlocks(newAchievements, winner, loser, ctx);
  if (achievementText) {
    message += "\n\n" + achievementText;
  }

  await ctx.reply(message);
}
