import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries, groupQueries, matchQueries } from "@smashrank/db";
import {
  createTestBot,
  sendMessage,
  sendCallback,
  lastReply,
  lastEdit,
  getSentMessages,
  getEditedMessages,
  resetCounters,
  type CapturedCall,
} from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("rematch prompt", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  async function registerPlayer(userId: number, username: string, displayName: string) {
    await sendMessage(bot, { text: "/start", userId, username, displayName });
    calls.length = 0;
  }

  function extractRematchBtn(callsList: CapturedCall[]): string {
    const messages = getSentMessages(callsList);
    const reply = messages[messages.length - 1];
    const keyboard = reply.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const rematchBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.startsWith("rm:"))!;
    return rematchBtn.callback_data;
  }

  it("shows rematch button after /game", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const reply = messages[messages.length - 1];
    expect(reply.text).toContain("Alice");
    expect(reply.text).toContain("Bob");
    expect(reply.reply_markup).toBeDefined();
    const keyboard = reply.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const rematchBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.startsWith("rm:"));
    expect(rematchBtn).toBeDefined();
    expect(rematchBtn!.text).toBe("Rematch?");
  });

  it("does NOT show rematch button when setting is off", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/settings rematch_prompt off",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const reply = messages[messages.length - 1];
    if (reply.reply_markup) {
      const keyboard = reply.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
      const rematchBtn = keyboard.inline_keyboard.flat().find((b) => b.callback_data.startsWith("rm:"));
      expect(rematchBtn).toBeUndefined();
    }
  });

  it("tapping rematch creates challenge session at who_won state", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const rematchData = extractRematchBtn(calls);
    calls.length = 0;

    await sendCallback(bot, {
      data: rematchData,
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const edited = lastEdit(calls);
    expect(edited).toContain("Rematch");
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    const lastEditCall = editCalls[editCalls.length - 1];
    const wonKeyboard = lastEditCall.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const wonBtns = wonKeyboard.inline_keyboard[0];
    expect(wonBtns.some((b) => b.callback_data.startsWith("ch:won:"))).toBe(true);
  });

  it("rejects non-participants from tapping rematch", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "charlie", "Charlie");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const rematchData = extractRematchBtn(calls);
    calls.length = 0;

    await sendCallback(bot, {
      data: rematchData,
      userId: 300,
      username: "charlie",
      displayName: "Charlie",
    });

    const answerCalls = calls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls.length).toBeGreaterThan(0);
    expect(answerCalls[answerCalls.length - 1].payload.text).toContain("participant");
  });

  it("loser can also tap rematch", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const rematchData = extractRematchBtn(calls);
    calls.length = 0;

    // Bob (the loser) taps rematch
    await sendCallback(bot, {
      data: rematchData,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const edited = lastEdit(calls);
    expect(edited).toContain("Rematch");
    // Should show who-won buttons
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    const lastEditCall = editCalls[editCalls.length - 1];
    const wonKeyboard = lastEditCall.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    expect(wonKeyboard.inline_keyboard[0].some((b) => b.callback_data.startsWith("ch:won:"))).toBe(true);
  });

  it("completes full rematch flow: rematch → who won → score → match recorded", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Play original match
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const rematchData = extractRematchBtn(calls);
    calls.length = 0;

    // Alice taps rematch
    await sendCallback(bot, {
      data: rematchData,
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Extract who-won buttons
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    const lastEditCall = editCalls[editCalls.length - 1];
    const wonKeyboard = lastEditCall.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    // Pick the first player button (challenger side)
    const wonBtn = wonKeyboard.inline_keyboard[0][0];
    const winnerSide = wonBtn.callback_data;

    calls.length = 0;

    // Pick who won
    await sendCallback(bot, {
      data: winnerSide,
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const scorePrompt = lastEdit(calls);
    expect(scorePrompt.toLowerCase()).toContain("score");

    calls.length = 0;

    // Enter score
    await sendMessage(bot, {
      text: "11-9 11-7",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const matchReply = lastReply(calls);
    // Match result should be shown
    expect(matchReply).toContain("beat");

    // Verify second match was recorded in DB
    const sql = getConnection();
    const group = await groupQueries(sql).findByChatId(-1001);
    const alice = await playerQueries(sql).findByTelegramId(100);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    // Alice should have 2 wins (original + rematch) or 1 win + 1 loss depending on who won
    expect(aliceMember!.games_played).toBe(2);
  });

  it("shows rematch button after /newgame flow", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Play a match first so /newgame shows Bob as a recent opponent
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    // Start newgame
    await sendMessage(bot, {
      text: "/newgame",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Pick Bob
    const messages = getSentMessages(calls);
    const oppMsg = messages[messages.length - 1];
    const oppKeyboard = oppMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const bobBtn = oppKeyboard.inline_keyboard.flat().find((b) => b.callback_data.includes("opp:"))!;

    calls.length = 0;
    await sendCallback(bot, {
      data: bobBtn.callback_data,
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Pick "I won"
    const editCalls1 = calls.filter((c) => c.method === "editMessageText");
    const wonKeyboard = editCalls1[editCalls1.length - 1].payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const iWonBtn = wonKeyboard.inline_keyboard[0].find((b) => b.callback_data.includes(":me"))!;

    calls.length = 0;
    await sendCallback(bot, {
      data: iWonBtn.callback_data,
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    calls.length = 0;
    await sendMessage(bot, {
      text: "11-8 11-6",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Verify reply has rematch button
    const finalMessages = getSentMessages(calls);
    const finalReply = finalMessages[finalMessages.length - 1];
    expect(finalReply.reply_markup).toBeDefined();
    const finalKeyboard = finalReply.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const rmBtn = finalKeyboard.inline_keyboard.flat().find((b) => b.callback_data.startsWith("rm:"));
    expect(rmBtn).toBeDefined();
  });

  it("shows rematch button after challenge match completes", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Issue challenge
    await sendMessage(bot, {
      text: "/challenge @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const sentMsg = getSentMessages(calls).pop()!;
    const keyboard = sentMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const acceptBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("accept"))!;
    calls.length = 0;

    // Bob accepts
    await sendCallback(bot, {
      data: acceptBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    // Pick who won
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    const wonKeyboard = editCalls[editCalls.length - 1].payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const iWonBtn = wonKeyboard.inline_keyboard[0].find((b) => b.callback_data.includes("challenged"))!;
    calls.length = 0;

    await sendCallback(bot, {
      data: iWonBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    calls.length = 0;

    // Enter score
    await sendMessage(bot, {
      text: "11-5 11-3",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    // Verify reply has rematch button
    const finalMessages = getSentMessages(calls);
    const finalReply = finalMessages[finalMessages.length - 1];
    expect(finalReply.reply_markup).toBeDefined();
    const finalKeyboard = finalReply.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const rmBtn = finalKeyboard.inline_keyboard.flat().find((b) => b.callback_data.startsWith("rm:"));
    expect(rmBtn).toBeDefined();
  });
});
