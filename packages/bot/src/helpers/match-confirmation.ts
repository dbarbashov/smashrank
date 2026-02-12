import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";
import type { RecordMatchInput } from "./record-match.js";
import { recordMatch } from "./record-match.js";
import { formatAchievementUnlocks } from "./format-achievements.js";
import { buildRematchKeyboard } from "./rematch.js";
import { generateMatchCommentary } from "@smashrank/core";
import type { MatchCommentaryContext } from "@smashrank/core";

export interface PendingMatch {
  id: string;
  matchInput: RecordMatchInput;
  reporterTelegramId: number;
  opponentTelegramId: number;
  winnerName: string;
  loserName: string;
  winnerId: string;
  loserId: string;
  score: string;
  chatId: number;
  groupLanguage: string;
  commentaryEnabled: boolean;
  setScoresStr: string | null;
  winnerSets: number;
  loserSets: number;
  expiresAt: number;
}

export const pendingMatches = new Map<string, PendingMatch>();

let idCounter = 0;
function generateId(): string {
  return `pm_${Date.now()}_${++idCounter}`;
}

export function addPendingMatch(data: Omit<PendingMatch, "id" | "expiresAt">): PendingMatch {
  const id = generateId();
  const pm: PendingMatch = {
    ...data,
    id,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
  };
  pendingMatches.set(id, pm);
  return pm;
}

export function buildConfirmationKeyboard(pmId: string, ctx: SmashRankContext): InlineKeyboard {
  return new InlineKeyboard()
    .text(ctx.t("confirmation.confirm_btn"), `mc:confirm:${pmId}`)
    .text(ctx.t("confirmation.dispute_btn"), `mc:dispute:${pmId}`);
}

export async function matchConfirmCallbackHandler(ctx: SmashRankContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("mc:")) return;

  const parts = data.split(":");
  const action = parts[1]; // "confirm" or "dispute"
  const pmId = parts[2];

  const pm = pendingMatches.get(pmId);
  if (!pm) {
    await ctx.answerCallbackQuery({ text: "Session expired." });
    return;
  }

  const fromId = ctx.from?.id;
  if (!fromId) return;

  // Only the opponent (not the reporter) can confirm/dispute
  if (fromId !== pm.opponentTelegramId) {
    await ctx.answerCallbackQuery({ text: ctx.t("confirmation.not_opponent") });
    return;
  }

  pendingMatches.delete(pmId);

  if (action === "confirm") {
    const result = await recordMatch(pm.matchInput);
    const { eloResult, winnerStreak, newAchievements, winnerMember, loserMember } = result;

    const commentaryContext: MatchCommentaryContext = {
      winner: {
        name: pm.winnerName,
        elo_before: winnerMember.elo_rating,
        elo_after: eloResult.winnerNewRating,
      },
      loser: {
        name: pm.loserName,
        elo_before: loserMember.elo_rating,
        elo_after: eloResult.loserNewRating,
      },
      set_scores: pm.setScoresStr ?? `${pm.winnerSets}-${pm.loserSets}`,
      elo_change: eloResult.change,
      is_upset: loserMember.elo_rating > winnerMember.elo_rating,
      elo_gap: Math.abs(winnerMember.elo_rating - loserMember.elo_rating),
      winner_streak: winnerStreak.currentStreak,
      achievements: newAchievements.map((a) => a.achievementId),
    };

    const llmMessage = pm.commentaryEnabled
      ? await generateMatchCommentary(commentaryContext, pm.groupLanguage)
      : null;

    let message: string;
    if (llmMessage) {
      message = llmMessage;
    } else {
      const templateKey = pm.setScoresStr ? "game.result_with_sets" : "game.result";
      message = ctx.t(templateKey, {
        winner: pm.winnerName,
        loser: pm.loserName,
        winnerSets: pm.winnerSets,
        loserSets: pm.loserSets,
        setScores: pm.setScoresStr,
        eloBeforeWinner: winnerMember.elo_rating,
        eloAfterWinner: eloResult.winnerNewRating,
        eloBeforeLoser: loserMember.elo_rating,
        eloAfterLoser: eloResult.loserNewRating,
        change: eloResult.change,
      });
    }

    // We need winner/loser Player objects for achievement formatting
    const { getConnection, playerQueries } = await import("@smashrank/db");
    const sql = getConnection();
    const players = playerQueries(sql);
    const [winner, loser] = await Promise.all([
      players.findById(pm.winnerId),
      players.findById(pm.loserId),
    ]);

    if (winner && loser) {
      const achievementText = formatAchievementUnlocks(newAchievements, winner, loser, ctx);
      if (achievementText) {
        message += "\n\n" + achievementText;
      }
    }

    const rematchKb = buildRematchKeyboard(pm.matchInput.group.id, pm.winnerId, pm.loserId, ctx);

    await ctx.editMessageText(
      ctx.t("confirmation.confirmed") + "\n\n" + message,
      rematchKb ? { reply_markup: rematchKb } : undefined,
    );
    await ctx.answerCallbackQuery();
  } else if (action === "dispute") {
    await ctx.editMessageText(ctx.t("confirmation.disputed"));
    await ctx.answerCallbackQuery();
  }
}

/**
 * Called by the scheduler to auto-confirm expired pending matches.
 */
export async function cleanupExpiredConfirmations(bot: Bot<SmashRankContext>): Promise<void> {
  const now = Date.now();
  for (const [id, pm] of pendingMatches) {
    if (now <= pm.expiresAt) continue;

    pendingMatches.delete(id);

    try {
      const result = await recordMatch(pm.matchInput);
      const { eloResult, winnerMember, loserMember } = result;

      const { getT } = await import("@smashrank/core");
      const t = getT(pm.groupLanguage);

      const message = t("confirmation.auto_confirmed") + "\n\n"
        + `${pm.winnerName} beat ${pm.loserName} ${pm.winnerSets}-${pm.loserSets}\n`
        + `${pm.winnerName}: ${winnerMember.elo_rating} \u2192 ${eloResult.winnerNewRating} (+${eloResult.change})\n`
        + `${pm.loserName}: ${loserMember.elo_rating} \u2192 ${eloResult.loserNewRating} (-${eloResult.change})`;

      await bot.api.sendMessage(pm.chatId, message);
    } catch (err) {
      console.error("Auto-confirm error:", err);
    }
  }
}
