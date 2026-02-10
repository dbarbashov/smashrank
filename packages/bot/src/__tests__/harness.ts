import { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { SmashRankContext } from "../context.js";
import { autoRegister } from "../middleware/auto-register.js";
import { startCommand } from "../commands/start.js";
import { gameCommand } from "../commands/game.js";
import { leaderboardCommand } from "../commands/leaderboard.js";
import { statsCommand } from "../commands/stats.js";
import { helpCommand } from "../commands/help.js";
import { langCommand } from "../commands/lang.js";
import { undoCommand } from "../commands/undo.js";
import { h2hCommand } from "../commands/h2h.js";
import { newgameCommand, newgameCallbackHandler, processNewgameScore } from "../commands/newgame.js";
import { achievementsCommand } from "../commands/achievements.js";
import { settingsCommand } from "../commands/settings.js";
import { doublesCommand } from "../commands/doubles.js";
import { newdoublesCommand, newdoublesCallbackHandler, processNewdoublesScore } from "../commands/newdoubles.js";
import { tournamentCommand } from "../commands/tournament.js";
import { tgameCommand } from "../commands/tgame.js";
import { challengeCommand, challengeCallbackHandler, processChallengeScore } from "../commands/challenge.js";
import { matchesCommand } from "../commands/matches.js";
import { listAchievementsCommand } from "../commands/list-achievements.js";
import { webCommand } from "../commands/web.js";

export interface CapturedCall {
  method: string;
  payload: Record<string, unknown>;
}

let updateCounter = 1;
let messageCounter = 1;

export function resetCounters(): void {
  updateCounter = 1;
  messageCounter = 1;
}

export function createTestBot(): { bot: Bot<SmashRankContext>; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];

  const bot = new Bot<SmashRankContext>("test:token", {
    botInfo: {
      id: 123456789,
      is_bot: true,
      first_name: "SmashRankBot",
      username: "smashrank_bot",
      can_join_groups: true,
      can_read_all_group_messages: true,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    } satisfies UserFromGetMe,
  });

  // Install API interceptor — cast to `any` because grammY's Transformer
  // generic makes it impossible to return different result types per method.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot.api.config.use(((prev: unknown, method: string, payload: any) => {
    calls.push({ method, payload: payload as Record<string, unknown> });

    if (method === "sendMessage") {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: messageCounter++,
          date: Math.floor(Date.now() / 1000),
          chat: { id: payload.chat_id, type: "supergroup", title: "Test Group" },
          text: payload.text,
        },
      });
    }

    if (method === "editMessageText") {
      return Promise.resolve({
        ok: true,
        result: {
          message_id: payload.message_id ?? messageCounter++,
          date: Math.floor(Date.now() / 1000),
          chat: { id: payload.chat_id, type: "supergroup", title: "Test Group" },
          text: payload.text,
        },
      });
    }

    if (method === "answerCallbackQuery") {
      return Promise.resolve({ ok: true, result: true });
    }

    if (method === "getUserProfilePhotos") {
      return Promise.resolve({
        ok: true,
        result: {
          total_count: 1,
          photos: [[{ file_id: "test_avatar_file_id", file_unique_id: "test_unique", width: 100, height: 100 }]],
        },
      });
    }

    if (method === "getChatMember") {
      return Promise.resolve({
        ok: true,
        result: {
          status: "creator",
          user: { id: payload.user_id, is_bot: false, first_name: "Admin" },
          is_anonymous: false,
        },
      });
    }

    // Default: return a generic success
    return Promise.resolve({ ok: true, result: true });
  }) as any);

  // Register middleware and commands (same as index.ts)
  bot.use(autoRegister);

  bot.use(async (ctx, next) => {
    if (ctx.message?.text && !ctx.message.text.startsWith("/")) {
      const handled = await processChallengeScore(ctx as SmashRankContext)
        || await processNewgameScore(ctx as SmashRankContext)
        || await processNewdoublesScore(ctx as SmashRankContext);
      if (handled) return;
    }
    await next();
  });

  bot.command("start", startCommand);
  bot.command("game", gameCommand);
  bot.command("leaderboard", leaderboardCommand);
  bot.command("stats", statsCommand);
  bot.command("help", helpCommand);
  bot.command("lang", langCommand);
  bot.command("undo", undoCommand);
  bot.command("h2h", h2hCommand);
  bot.command("newgame", newgameCommand);
  bot.command("achievements", achievementsCommand);
  bot.command("settings", settingsCommand);
  bot.command("doubles", doublesCommand);
  bot.command("newdoubles", newdoublesCommand);
  bot.command("tournament", tournamentCommand);
  bot.command("tgame", tgameCommand);
  bot.command("challenge", challengeCommand);
  bot.command("matches", matchesCommand);
  bot.command("listachievements", listAchievementsCommand);
  bot.command("web", webCommand);

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("ng:")) {
      await newgameCallbackHandler(ctx as SmashRankContext);
    } else if (data.startsWith("nd:")) {
      await newdoublesCallbackHandler(ctx as SmashRankContext);
    } else if (data.startsWith("ch:")) {
      await challengeCallbackHandler(ctx as SmashRankContext);
    }
  });

  return { bot, calls };
}

export interface SendMessageOpts {
  text: string;
  userId?: number;
  username?: string;
  displayName?: string;
  chatId?: number;
  chatType?: "group" | "supergroup" | "private";
}

export async function sendMessage(
  bot: Bot<SmashRankContext>,
  opts: SendMessageOpts,
): Promise<void> {
  const userId = opts.userId ?? 100;
  const chatId = opts.chatId ?? -1001;
  const chatType = opts.chatType ?? "supergroup";
  const text = opts.text;

  const entities = text.startsWith("/")
    ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }]
    : [];

  const update: Update = {
    update_id: updateCounter++,
    message: {
      message_id: messageCounter++,
      from: {
        id: userId,
        is_bot: false,
        first_name: opts.displayName ?? "Player",
        username: opts.username,
      },
      chat: chatType === "private"
        ? { id: userId, type: "private", first_name: opts.displayName ?? "Player" }
        : { id: chatId, type: chatType, title: "Test Group" },
      date: Math.floor(Date.now() / 1000),
      text,
      entities,
    },
  };

  await bot.handleUpdate(update);
}

export interface SendCallbackOpts {
  data: string;
  userId?: number;
  username?: string;
  displayName?: string;
  chatId?: number;
  messageId?: number;
}

export async function sendCallback(
  bot: Bot<SmashRankContext>,
  opts: SendCallbackOpts,
): Promise<void> {
  const userId = opts.userId ?? 100;
  const chatId = opts.chatId ?? -1001;

  const update: Update = {
    update_id: updateCounter++,
    callback_query: {
      id: String(updateCounter),
      from: {
        id: userId,
        is_bot: false,
        first_name: opts.displayName ?? "Player",
        username: opts.username,
      },
      chat_instance: "test",
      data: opts.data,
      message: {
        message_id: opts.messageId ?? messageCounter++,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "supergroup", title: "Test Group" },
        text: "...",
      },
    },
  };

  await bot.handleUpdate(update);
}

/** Filter captured calls for sendMessage responses */
export function getSentMessages(calls: CapturedCall[]): { text: string; chatId: number; reply_markup?: unknown }[] {
  return calls
    .filter((c) => c.method === "sendMessage")
    .map((c) => ({
      text: c.payload.text as string,
      chatId: c.payload.chat_id as number,
      reply_markup: c.payload.reply_markup,
    }));
}

/** Get last sendMessage text */
export function lastReply(calls: CapturedCall[]): string {
  const messages = getSentMessages(calls);
  return messages[messages.length - 1]?.text ?? "";
}

/** Filter captured calls for editMessageText responses */
export function getEditedMessages(calls: CapturedCall[]): { text: string }[] {
  return calls
    .filter((c) => c.method === "editMessageText")
    .map((c) => ({ text: c.payload.text as string }));
}

/** Get last editMessageText text */
export function lastEdit(calls: CapturedCall[]): string {
  const edits = getEditedMessages(calls);
  return edits[edits.length - 1]?.text ?? "";
}
