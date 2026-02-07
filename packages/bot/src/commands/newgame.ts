import type postgres from "postgres";
import { InlineKeyboard } from "grammy";
import {
  getConnection,
  playerQueries,
  matchQueries,
} from "@smashrank/db";
import {
  parseGameCommand,
  calculateElo,
  updateStreak,
  generateMatchCommentary,
} from "@smashrank/core";
import type { MatchCommentaryContext } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { ensureActiveSeason } from "../helpers/ensure-season.js";

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

// Callback data format:
//   ng:opp:<opponentId>     — opponent selected
//   ng:win:<opponentId>:me  — I won
//   ng:win:<opponentId>:them — They won

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
    // Opponent selected — ask who won
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
    // Winner selected — store pending session and ask for score
    const opponentId = parts[2];
    const winnerSide = parts[3] as "me" | "them";

    const key = sessionKey(chatId, userId);
    pendingSessions.set(key, {
      opponentId,
      winnerSide,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min timeout
    });

    await ctx.editMessageText(ctx.t("newgame.enter_score"));
    await ctx.answerCallbackQuery();
  }
}

// Process the next text message as a score for a pending /newgame session
export async function processNewgameScore(ctx: SmashRankContext): Promise<boolean> {
  if (!ctx.group) return false;

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return false;

  const key = sessionKey(chatId, userId);
  const session = pendingSessions.get(key);
  if (!session) return false;

  // Clean up expired session
  if (Date.now() > session.expiresAt) {
    pendingSessions.delete(key);
    return false;
  }

  // Consume the session immediately
  pendingSessions.delete(key);

  const scoreText = ctx.message?.text?.trim();
  if (!scoreText) return false;

  const sql = getConnection();
  const players = playerQueries(sql);
  const matches = matchQueries(sql);

  const opponent = await players.findById(session.opponentId);
  if (!opponent) return false;

  // Build a fake /game command for the parser — always use "won" format
  // and swap winner/loser based on winnerSide
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

  const season = await ensureActiveSeason(ctx.group.id);
  const eloResult = calculateElo({
    winnerRating: winner.elo_rating,
    loserRating: loser.elo_rating,
    winnerGamesPlayed: winner.games_played,
    loserGamesPlayed: loser.games_played,
  });

  const winnerStreak = updateStreak(winner.current_streak, winner.best_streak, true);
  const loserStreak = updateStreak(loser.current_streak, loser.best_streak, false);

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

  const commentaryContext: MatchCommentaryContext = {
    winner: {
      name: winner.display_name,
      elo_before: winner.elo_rating,
      elo_after: eloResult.winnerNewRating,
    },
    loser: {
      name: loser.display_name,
      elo_before: loser.elo_rating,
      elo_after: eloResult.loserNewRating,
    },
    set_scores: setScoresStr ?? `${data.winnerSets}-${data.loserSets}`,
    elo_change: eloResult.change,
    is_upset: loser.elo_rating > winner.elo_rating,
    elo_gap: Math.abs(winner.elo_rating - loser.elo_rating),
    winner_streak: winnerStreak.currentStreak,
  };

  const language = ctx.group?.language ?? "en";
  const llmMessage = await generateMatchCommentary(commentaryContext, language);

  if (llmMessage) {
    await ctx.reply(llmMessage);
  } else {
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

  return true;
}
