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

describe("/challenge", () => {
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

  it("issues a challenge with accept/decline buttons", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/challenge @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const messages = getSentMessages(calls);
    const reply = messages[messages.length - 1];
    expect(reply.text).toContain("Alice");
    expect(reply.text).toContain("Bob");
    // Should have inline keyboard
    expect(reply.reply_markup).toBeDefined();
  });

  it("shows usage when no mention provided", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/challenge",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("/challenge @");
  });

  it("shows error for self-challenge", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/challenge @alice",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply.toLowerCase()).toContain("yourself");
  });

  it("shows error for unknown player", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/challenge @nobody",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("nobody");
    expect(reply).toContain("not found");
  });

  it("shows group_only error in private chat", async () => {
    await sendMessage(bot, {
      text: "/challenge @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatType: "private",
      chatId: 100,
    });

    const reply = lastReply(calls);
    expect(reply).toContain("group");
  });

  it("prevents duplicate challenges between same players", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/challenge @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/challenge @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("already");
  });

  it("allows challenged player to decline", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/challenge @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    // Extract the challenge key from the callback data in the keyboard
    const sentMsg = getSentMessages(calls).pop()!;
    const keyboard = sentMsg.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const declineBtn = keyboard.inline_keyboard[0].find((b) => b.callback_data.includes("decline"))!;

    calls.length = 0;

    // Bob (userId 200) declines
    await sendCallback(bot, {
      data: declineBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const edited = lastEdit(calls);
    expect(edited).toContain("declined");
  });

  it("completes full challenge flow: accept → who won → score → match recorded", async () => {
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

    const acceptedText = lastEdit(calls);
    expect(acceptedText).toContain("accepted");
    expect(acceptedText).toContain("Who won");

    // Extract who_won buttons
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    const lastEditCall = editCalls[editCalls.length - 1];
    const wonKeyboard = lastEditCall.payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    // Pick "challenged" won (Bob won) — the "I won" button when Bob is clicking
    const iWonBtn = wonKeyboard.inline_keyboard[0].find((b) => b.callback_data.includes("challenged"))!;

    calls.length = 0;

    // Bob says "I won"
    await sendCallback(bot, {
      data: iWonBtn.callback_data,
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const scorePrompt = lastEdit(calls);
    expect(scorePrompt).toContain("score");

    calls.length = 0;

    // Bob enters score
    await sendMessage(bot, {
      text: "11-7 11-5",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const matchReply = lastReply(calls);
    expect(matchReply).toContain("Bob");
    expect(matchReply).toContain("Alice");

    // Verify DB: Bob should have 1 win
    const sql = getConnection();
    const bob = await playerQueries(sql).findByTelegramId(200);
    const group = await groupQueries(sql).findByChatId(-1001);
    const bobMember = await groupQueries(sql).getGroupMember(group!.id, bob!.id);
    expect(bobMember!.wins).toBe(1);
  });
});
