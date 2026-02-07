import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/achievements", () => {
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

  it("shows no achievements message initially", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/achievements", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("no achievements");
  });

  it("shows first_blood after first win", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, { text: "/achievements", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("First Blood");
    expect(reply).toContain("Alice");
  });

  it("shows another player's achievements via /achievements @user", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Bob wins so Bob gets first_blood
    await sendMessage(bot, {
      text: "/game @alice 11-5 11-3",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/achievements @bob",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    const reply = lastReply(calls);
    expect(reply).toContain("Bob");
    expect(reply).toContain("First Blood");
  });
});
