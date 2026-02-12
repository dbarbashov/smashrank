import { InlineKeyboard } from "grammy";
import type { SmashRankContext } from "../context.js";
import {
  challengeSessions,
  challengeKey,
  pendingScores,
  scoreKey,
} from "../commands/challenge.js";
import type { ChallengeSession } from "../commands/challenge.js";

/**
 * Build a "Rematch?" inline keyboard after a singles match.
 * Returns null if the rematch_prompt setting is off.
 */
export function buildRematchKeyboard(
  groupId: string,
  winnerId: string,
  loserId: string,
  ctx: SmashRankContext,
): InlineKeyboard | null {
  if (ctx.group?.settings?.rematch_prompt === "off") return null;

  return new InlineKeyboard()
    .text(ctx.t("rematch.prompt"), `rm:${groupId}:${winnerId}:${loserId}`);
}

/**
 * Handle rm: callback queries — create a challenge session at "who_won" state.
 */
export async function rematchCallbackHandler(ctx: SmashRankContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("rm:")) return;

  const parts = data.split(":");
  // rm:groupId:winnerId:loserId
  const groupId = parts[1];
  const winnerId = parts[2];
  const loserId = parts[3];

  if (!ctx.group) {
    await ctx.answerCallbackQuery({ text: "Session expired." });
    return;
  }

  const fromId = ctx.from?.id;
  if (!fromId) return;

  // Look up both players from DB
  const { getConnection, playerQueries } = await import("@smashrank/db");
  const sql = getConnection();
  const players = playerQueries(sql);

  const [winner, loser] = await Promise.all([
    players.findById(winnerId),
    players.findById(loserId),
  ]);

  if (!winner || !loser) {
    await ctx.answerCallbackQuery({ text: "Player not found." });
    return;
  }

  // Only match participants can request a rematch
  const winnerTelegramId = Number(winner.telegram_id);
  const loserTelegramId = Number(loser.telegram_id);

  if (fromId !== winnerTelegramId && fromId !== loserTelegramId) {
    await ctx.answerCallbackQuery({ text: ctx.t("rematch.not_participant") });
    return;
  }

  // Check for existing active challenge between these players
  const key = challengeKey(groupId, winnerId, loserId);
  const existing = challengeSessions.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    await ctx.answerCallbackQuery({ text: ctx.t("challenge.already_pending", { opponent: "" }) });
    return;
  }

  // Determine who is challenger (the person who clicked) and who is challenged
  const isClickerWinner = fromId === winnerTelegramId;
  const challengerId = isClickerWinner ? winnerId : loserId;
  const challengedId = isClickerWinner ? loserId : winnerId;
  const challengerTelegramId = isClickerWinner ? winnerTelegramId : loserTelegramId;
  const challengedTelegramId = isClickerWinner ? loserTelegramId : winnerTelegramId;
  const challengerName = isClickerWinner ? winner.display_name : loser.display_name;
  const challengedName = isClickerWinner ? loser.display_name : winner.display_name;

  // Create challenge session directly at "who_won" state (skip pending/accept)
  const session: ChallengeSession = {
    challengerId,
    challengerTelegramId,
    challengerName,
    challengedId,
    challengedTelegramId,
    challengedName,
    groupId,
    chatId: ctx.chat!.id,
    state: "who_won",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  challengeSessions.set(key, session);

  // Show who-won buttons using existing ch: prefix
  const keyboard = new InlineKeyboard()
    .text(challengerName, `ch:won:${key}:challenger`)
    .text(challengedName, `ch:won:${key}:challenged`);

  await ctx.editMessageText(
    ctx.t("rematch.accepted", {
      challenger: challengerName,
      challenged: challengedName,
    }),
    { reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
}
