import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/matches", () => {
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

  it("shows empty message when no matches played", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/matches",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("No matches");
  });

  it("shows recent matches after games are played", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/matches",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Recent Matches");
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
    expect(reply).toContain("beat");
  });

  it("shows group_only error in private chat", async () => {
    await sendMessage(bot, {
      text: "/matches",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatType: "private",
      chatId: 100,
    });

    const reply = lastReply(calls);
    expect(reply).toContain("group");
  });
});
