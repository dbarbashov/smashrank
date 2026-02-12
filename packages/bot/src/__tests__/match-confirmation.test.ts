import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries, groupQueries } from "@smashrank/db";
import {
  createTestBot,
  sendMessage,
  sendCallback,
  lastReply,
  lastEdit,
  getSentMessages,
  resetCounters,
  type CapturedCall,
} from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("match confirmation", () => {
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

  async function enableConfirmation() {
    await sendMessage(bot, {
      text: "/settings match_confirmation on",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;
  }

  it("/game with setting ON shows confirmation prompt, match NOT recorded", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("confirm");

    // Match should NOT be recorded yet
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const group = await groupQueries(sql).findByChatId(-1001);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.wins).toBe(0);
  });

  it("/game with setting OFF records match immediately", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Match should be recorded
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const group = await groupQueries(sql).findByChatId(-1001);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.wins).toBe(1);
  });

  it("opponent confirms → match recorded", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Find the confirmation keyboard
    const messages = getSentMessages(calls);
    const confirmMsg = messages[messages.length - 1];
    const keyboard = confirmMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const confirmBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("confirm"))!;

    calls.length = 0;

    // Bob (opponent, userId 200) confirms
    await sendCallback(bot, {
      data: confirmBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const edited = lastEdit(calls);
    expect(edited).toContain("confirmed");

    // Match should now be recorded
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const group = await groupQueries(sql).findByChatId(-1001);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.wins).toBe(1);
  });

  it("opponent disputes → match not recorded", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const confirmMsg = messages[messages.length - 1];
    const keyboard = confirmMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const disputeBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("dispute"))!;

    calls.length = 0;

    // Bob disputes
    await sendCallback(bot, {
      data: disputeBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const edited = lastEdit(calls);
    expect(edited).toContain("disputed");

    // Match should NOT be recorded
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const group = await groupQueries(sql).findByChatId(-1001);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.wins).toBe(0);
  });

  it("non-opponent rejected", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "charlie", "Charlie");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const confirmMsg = messages[messages.length - 1];
    const keyboard = confirmMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const confirmBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("confirm"))!;

    calls.length = 0;

    // Charlie (non-opponent) tries to confirm
    await sendCallback(bot, {
      data: confirmBtn.callback_data,
      userId: 300,
      username: "charlie",
      displayName: "Charlie",
    });

    const answerCalls = calls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls.length).toBeGreaterThan(0);
    const lastAnswer = answerCalls[answerCalls.length - 1];
    expect(lastAnswer.payload.text).toContain("opponent");
  });

  it("reporter cannot confirm own match", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const confirmMsg = messages[messages.length - 1];
    const keyboard = confirmMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const confirmBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("confirm"))!;

    calls.length = 0;

    // Alice (the reporter) tries to confirm her own report
    await sendCallback(bot, {
      data: confirmBtn.callback_data,
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const answerCalls = calls.filter((c) => c.method === "answerCallbackQuery");
    expect(answerCalls.length).toBeGreaterThan(0);
    expect(answerCalls[answerCalls.length - 1].payload.text).toContain("opponent");

    // Match should NOT be recorded
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const group = await groupQueries(sql).findByChatId(-1001);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.wins).toBe(0);
  });

  it("opponent confirms → ELO updated correctly", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const confirmMsg = messages[messages.length - 1];
    const keyboard = confirmMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const confirmBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("confirm"))!;

    calls.length = 0;

    await sendCallback(bot, {
      data: confirmBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    // Verify both players' ELO changed
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const bob = await playerQueries(sql).findByTelegramId(200);
    const group = await groupQueries(sql).findByChatId(-1001);
    const aliceMember = await groupQueries(sql).getGroupMember(group!.id, alice!.id);
    const bobMember = await groupQueries(sql).getGroupMember(group!.id, bob!.id);

    // Alice won, so her ELO should increase and Bob's should decrease relative to each other
    expect(aliceMember!.elo_rating).toBeGreaterThan(bobMember!.elo_rating);
    expect(aliceMember!.wins).toBe(1);
    expect(bobMember!.losses).toBe(1);
  });

  it("opponent confirms → rematch button shown", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const confirmMsg = messages[messages.length - 1];
    const keyboard = confirmMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const confirmBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("confirm"))!;

    calls.length = 0;

    await sendCallback(bot, {
      data: confirmBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    // Check editMessageText has rematch keyboard
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    expect(editCalls.length).toBeGreaterThan(0);
    const lastEditCall = editCalls[editCalls.length - 1];
    const rmKeyboard = lastEditCall.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const rmBtn = rmKeyboard?.inline_keyboard?.flat().find((b) => b.callback_data.startsWith("rm:"));
    expect(rmBtn).toBeDefined();
  });

  it("challenge match bypasses confirmation", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await enableConfirmation();

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

    // Match should be recorded immediately (no confirmation prompt)
    const reply = lastReply(calls);
    expect(reply).toContain("beat");

    // Verify match was recorded
    const sql = getConnection();
    const bob = await playerQueries(sql).findByTelegramId(200);
    const group = await groupQueries(sql).findByChatId(-1001);
    const bobMember = await groupQueries(sql).getGroupMember(group!.id, bob!.id);
    expect(bobMember!.wins).toBe(1);
  });
});
