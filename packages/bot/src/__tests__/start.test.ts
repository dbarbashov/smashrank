import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/start", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  it("shows welcome message on first registration", async () => {
    await sendMessage(bot, {
      text: "/start",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Welcome");
  });

  it("shows already registered after playing games", async () => {
    // Register and play a game first
    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/start", userId: 200, username: "bob", displayName: "Bob" });
    await sendMessage(bot, { text: "/game @bob 11-5 11-3", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });

    const reply = lastReply(calls);
    expect(reply).toContain("already registered");
  });
});
