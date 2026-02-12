import { InlineKeyboard } from "grammy";
import {
  getConnection,
  playerQueries,
  matchQueries,
} from "@smashrank/db";
import {
  parseGameCommand,
  generateMatchCommentary,
} from "@smashrank/core";
import type { MatchCommentaryContext } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { recordMatch } from "../helpers/record-match.js";
import { formatAchievementUnlocks } from "../helpers/format-achievements.js";
import { buildRematchKeyboard } from "../helpers/rematch.js";
import { addPendingMatch, buildConfirmationKeyboard } from "../helpers/match-confirmation.js";

// In-memory pending sessions: "chatId:userId" → { opponentId, winnerSide, expiresAt }
interface PendingScore {
  opponentId: string;
  winnerSide: "me" | "them";
  expiresAt: number;
}

const pendingSessions = new Map<string, PendingScore>();

function sessionKey(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export async function newgameCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const sql = getConnection();
  const matches = matchQueries(sql);

  const opponents = await matches.getRecentOpponents(ctx.player.id, ctx.group.id);

  if (opponents.length === 0) {
    await ctx.reply(ctx.t("newgame.no_opponents"));
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const opp of opponents) {
    keyboard.text(opp.display_name, `ng:opp:${opp.id}`).row();
  }

  await ctx.reply(ctx.t("newgame.who_played"), { reply_markup: keyboard });
}

export async function newgameCallbackHandler(ctx: SmashRankContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("ng:")) return;

  if (!ctx.group) {
    await ctx.answerCallbackQuery({ text: ctx.t("error.group_only") });
    return;
  }

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return;

  const parts = data.split(":");

  if (parts[1] === "opp") {
    const opponentId = parts[2];
    const sql = getConnection();
    const players = playerQueries(sql);
    const opponent = await players.findById(opponentId);

    if (!opponent) {
      await ctx.answerCallbackQuery({ text: "?" });
      return;
    }

    const keyboard = new InlineKeyboard()
      .text(ctx.t("newgame.i_won"), `ng:win:${opponentId}:me`)
      .text(ctx.t("newgame.they_won"), `ng:win:${opponentId}:them`);

    await ctx.editMessageText(
      ctx.t("newgame.who_won") + `\n(vs ${opponent.display_name})`,
      { reply_markup: keyboard },
    );
    await ctx.answerCallbackQuery();
  } else if (parts[1] === "win") {
    const opponentId = parts[2];
    const winnerSide = parts[3] as "me" | "them";

    const key = sessionKey(chatId, userId);
    pendingSessions.set(key, {
      opponentId,
      winnerSide,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await ctx.editMessageText(ctx.t("newgame.enter_score"));
    await ctx.answerCallbackQuery();
  }
}

export async function processNewgameScore(ctx: SmashRankContext): Promise<boolean> {
  if (!ctx.group) return false;

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return false;

  const key = sessionKey(chatId, userId);
  const session = pendingSessions.get(key);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    pendingSessions.delete(key);
    return false;
  }

  pendingSessions.delete(key);

  const scoreText = ctx.message?.text?.trim();
  if (!scoreText) return false;

  const sql = getConnection();
  const players = playerQueries(sql);

  const opponent = await players.findById(session.opponentId);
  if (!opponent) return false;

  const reporterUsername = ctx.from?.username ?? "me";
  const fakeCommand = `/game @${opponent.telegram_username ?? "opp"} won ${scoreText}`;

  const result = parseGameCommand(fakeCommand, reporterUsername);
  if (!result.ok) {
    await ctx.reply(ctx.t(`error.${result.error}`));
    return true;
  }

  const { data } = result;
  const winner = session.winnerSide === "me" ? ctx.player : opponent;
  const loser = session.winnerSide === "me" ? opponent : ctx.player;

  // Orient set scores: match winner's score first
  const orientedSetScores = data.setScores
    ? data.setScores.map((s) => {
        const isWinnerReporter = session.winnerSide === "me";
        return {
          w: isWinnerReporter ? s.reporterScore : s.opponentScore,
          l: isWinnerReporter ? s.opponentScore : s.reporterScore,
        };
      })
    : null;

  const setScoresStr = orientedSetScores
    ? orientedSetScores.map((s) => `${s.w}-${s.l}`).join(", ")
    : null;

  const commentaryEnabled = ctx.group.settings?.commentary !== false;
  const language = ctx.group?.language ?? "en";

  // Match confirmation check
  if (ctx.group.settings?.match_confirmation === "on") {
    const score = setScoresStr ?? `${data.winnerSets}-${data.loserSets}`;
    const pm = addPendingMatch({
      matchInput: {
        group: ctx.group,
        winner,
        loser,
        winnerSets: data.winnerSets,
        loserSets: data.loserSets,
        setScores: orientedSetScores,
        reportedBy: ctx.player.id,
      },
      reporterTelegramId: ctx.from!.id,
      opponentTelegramId: Number(opponent.telegram_id),
      winnerName: winner.display_name,
      loserName: loser.display_name,
      winnerId: winner.id,
      loserId: loser.id,
      score,
      chatId: ctx.chat!.id,
      groupLanguage: language,
      commentaryEnabled,
      setScoresStr,
      winnerSets: data.winnerSets,
      loserSets: data.loserSets,
    });

    const confirmKb = buildConfirmationKeyboard(pm.id, ctx);
    await ctx.reply(
      ctx.t("confirmation.pending", {
        reporter: ctx.player.display_name,
        winner: winner.display_name,
        loser: loser.display_name,
        score,
        opponent: opponent.display_name,
      }),
      { reply_markup: confirmKb },
    );
    return true;
  }

  const { eloResult, winnerStreak, newAchievements, winnerMember, loserMember } = await recordMatch({
    group: ctx.group,
    winner,
    loser,
    winnerSets: data.winnerSets,
    loserSets: data.loserSets,
    setScores: orientedSetScores,
    reportedBy: ctx.player.id,
  });

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

  const rematchKb = buildRematchKeyboard(ctx.group.id, winner.id, loser.id, ctx);
  await ctx.reply(message, rematchKb ? { reply_markup: rematchKb } : undefined);
  return true;
}
