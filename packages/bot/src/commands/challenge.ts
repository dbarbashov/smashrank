import { InlineKeyboard } from "grammy";
import {
  getConnection,
  playerQueries,
  groupQueries,
  matchQueries,
} from "@smashrank/db";
import {
  parseGameCommand,
  generateMatchCommentary,
  generateChallengeCommentary,
} from "@smashrank/core";
import type { MatchCommentaryContext } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { recordMatch } from "../helpers/record-match.js";
import { formatAchievementUnlocks } from "../helpers/format-achievements.js";
import { buildRematchKeyboard } from "../helpers/rematch.js";

export type ChallengeState = "pending" | "who_won" | "score_entry";

export interface ChallengeSession {
  challengerId: string;
  challengerTelegramId: number;
  challengerName: string;
  challengedId: string;
  challengedTelegramId: number;
  challengedName: string;
  groupId: string;
  chatId: number;
  state: ChallengeState;
  winnerSide?: "challenger" | "challenged";
  expiresAt: number;
}

// Key: "groupId:challengerId:challengedId"
export const challengeSessions = new Map<string, ChallengeSession>();

export function challengeKey(groupId: string, id1: string, id2: string): string {
  const [a, b] = [id1, id2].sort();
  return `${groupId}:${a}:${b}`;
}

export function scoreKey(chatId: number, telegramId: number): string {
  return `ch_score:${chatId}:${telegramId}`;
}

// Map for tracking score-entry sessions by chat+telegram user
export const pendingScores = new Map<string, string>(); // scoreKey → challengeKey

export async function challengeCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text ?? "";
  const mentionMatch = text.match(/@(\w+)/);
  if (!mentionMatch) {
    await ctx.reply(ctx.t("challenge.usage"));
    return;
  }

  const username = mentionMatch[1];
  const sql = getConnection();
  const players = playerQueries(sql);
  const groups = groupQueries(sql);

  const opponent = await players.findByUsername(username);
  if (!opponent) {
    await ctx.reply(ctx.t("game.player_not_found", { username }));
    return;
  }

  if (opponent.id === ctx.player.id) {
    await ctx.reply(ctx.t("error.self_play"));
    return;
  }

  const isMember = await groups.isMember(ctx.group.id, opponent.id);
  if (!isMember) {
    await ctx.reply(ctx.t("game.not_group_member", { username }));
    return;
  }

  const key = challengeKey(ctx.group.id, ctx.player.id, opponent.id);
  const existing = challengeSessions.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    await ctx.reply(ctx.t("challenge.already_pending", { opponent: opponent.display_name }));
    return;
  }

  const session: ChallengeSession = {
    challengerId: ctx.player.id,
    challengerTelegramId: ctx.from!.id,
    challengerName: ctx.player.display_name,
    challengedId: opponent.id,
    challengedTelegramId: Number(opponent.telegram_id),
    challengedName: opponent.display_name,
    groupId: ctx.group.id,
    chatId: ctx.chat!.id,
    state: "pending",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  challengeSessions.set(key, session);

  // Try LLM hype commentary
  const commentaryEnabled = ctx.group.settings?.commentary !== false;
  const language = ctx.group?.language ?? "en";
  let hypeMessage: string | null = null;

  if (commentaryEnabled) {
    const sql2 = getConnection();
    const members = groupQueries(sql2);
    const matches2 = matchQueries(sql2);
    const [challengerMember, challengedMember] = await Promise.all([
      members.getGroupMember(ctx.group.id, ctx.player.id),
      members.getGroupMember(ctx.group.id, opponent.id),
    ]);

    const h2h = await matches2.getH2H(ctx.player.id, opponent.id, ctx.group.id);

    hypeMessage = await generateChallengeCommentary(
      {
        challenger: { name: ctx.player.display_name, elo: challengerMember?.elo_rating ?? 1200 },
        challenged: { name: opponent.display_name, elo: challengedMember?.elo_rating ?? 1200 },
        h2h: h2h.totalMatches > 0
          ? { wins_challenger: h2h.winsA, wins_challenged: h2h.winsB, total: h2h.totalMatches }
          : undefined,
      },
      language,
    );
  }

  const messageText = hypeMessage
    ?? ctx.t("challenge.issued", {
        challenger: ctx.player.display_name,
        challenged: opponent.display_name,
      });

  const keyboard = new InlineKeyboard()
    .text(ctx.t("challenge.accept"), `ch:accept:${key}`)
    .text(ctx.t("challenge.decline"), `ch:decline:${key}`);

  await ctx.reply(messageText, { reply_markup: keyboard });
}

export async function challengeCallbackHandler(ctx: SmashRankContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("ch:")) return;

  const parts = data.split(":");
  const action = parts[1];
  // Key is parts[2]:parts[3]:parts[4] (groupId:playerId1:playerId2)
  const key = `${parts[2]}:${parts[3]}:${parts[4]}`;

  const session = challengeSessions.get(key);
  if (!session) {
    await ctx.answerCallbackQuery({ text: "Session expired." });
    return;
  }

  if (Date.now() > session.expiresAt) {
    challengeSessions.delete(key);
    await ctx.answerCallbackQuery({ text: "Challenge expired." });
    return;
  }

  const fromId = ctx.from?.id;

  if (action === "accept") {
    if (fromId !== session.challengedTelegramId) {
      await ctx.answerCallbackQuery({ text: "Only the challenged player can accept." });
      return;
    }

    session.state = "who_won";

    const keyboard = new InlineKeyboard()
      .text(ctx.t("challenge.i_won"), `ch:won:${key}:challenged`)
      .text(ctx.t("challenge.they_won"), `ch:won:${key}:challenger`);

    await ctx.editMessageText(
      ctx.t("challenge.accepted", {
        challenger: session.challengerName,
        challenged: session.challengedName,
      }) + "\n\n" + ctx.t("challenge.who_won"),
      { reply_markup: keyboard },
    );
    await ctx.answerCallbackQuery();
  } else if (action === "decline") {
    if (fromId !== session.challengedTelegramId) {
      await ctx.answerCallbackQuery({ text: "Only the challenged player can decline." });
      return;
    }

    challengeSessions.delete(key);
    await ctx.editMessageText(
      ctx.t("challenge.declined", {
        challenger: session.challengerName,
        challenged: session.challengedName,
      }),
    );
    await ctx.answerCallbackQuery();
  } else if (action === "won") {
    // parts[5] = "challenger" or "challenged"
    const winnerSide = parts[5] as "challenger" | "challenged";

    // Only accept/decline user or challenger can pick winner
    if (fromId !== session.challengedTelegramId && fromId !== session.challengerTelegramId) {
      await ctx.answerCallbackQuery({ text: "Only match participants can respond." });
      return;
    }

    session.winnerSide = winnerSide;
    session.state = "score_entry";

    // Track which user should enter the score (the one who clicked)
    const chatId = ctx.chat?.id ?? session.chatId;
    pendingScores.set(scoreKey(chatId, fromId!), key);

    await ctx.editMessageText(ctx.t("challenge.enter_score"));
    await ctx.answerCallbackQuery();
  }
}

export async function processChallengeScore(ctx: SmashRankContext): Promise<boolean> {
  if (!ctx.group) return false;

  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId) return false;

  const sKey = scoreKey(chatId, fromId);
  const cKey = pendingScores.get(sKey);
  if (!cKey) return false;

  const session = challengeSessions.get(cKey);
  if (!session || session.state !== "score_entry") {
    pendingScores.delete(sKey);
    return false;
  }

  if (Date.now() > session.expiresAt) {
    challengeSessions.delete(cKey);
    pendingScores.delete(sKey);
    return false;
  }

  // Clean up
  challengeSessions.delete(cKey);
  pendingScores.delete(sKey);

  const scoreText = ctx.message?.text?.trim();
  if (!scoreText) return false;

  const sql = getConnection();
  const players = playerQueries(sql);

  const challenger = await players.findById(session.challengerId);
  const challenged = await players.findById(session.challengedId);
  if (!challenger || !challenged) return false;

  const reporterUsername = ctx.from?.username ?? "me";
  const fakeCommand = `/game @opp won ${scoreText}`;

  const result = parseGameCommand(fakeCommand, reporterUsername);
  if (!result.ok) {
    await ctx.reply(ctx.t(`error.${result.error}`));
    return true;
  }

  const { data } = result;
  const winner = session.winnerSide === "challenger" ? challenger : challenged;
  const loser = session.winnerSide === "challenger" ? challenged : challenger;

  // Orient set scores
  const orientedSetScores = data.setScores
    ? data.setScores.map((s) => ({
        w: s.reporterScore,
        l: s.opponentScore,
      }))
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

  // Build response
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

  const rematchKb = buildRematchKeyboard(ctx.group.id, winner.id, loser.id, ctx);
  await ctx.reply(message, rematchKb ? { reply_markup: rematchKb } : undefined);
  return true;
}

export function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [key, session] of challengeSessions) {
    if (now > session.expiresAt) {
      challengeSessions.delete(key);
    }
  }
  for (const [key, cKey] of pendingScores) {
    const session = challengeSessions.get(cKey);
    if (!session) {
      pendingScores.delete(key);
    }
  }
}
