import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries } from "@smashrank/db";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/game", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  async function registerPlayer(userId: number, username: string, displayName: string) {
    await sendMessage(bot, {
      text: "/start",
      userId,
      username,
      displayName,
      chatId: -1001,
    });
    calls.length = 0; // clear registration replies
  }

  it("records a match with set scores", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
    expect(reply).toContain("11-7");
    expect(reply).toContain("11-5");

    // Verify DB state
    const sql = getConnection();
    const players = playerQueries(sql);
    const alice = await players.findByTelegramId(100);
    const bob = await players.findByTelegramId(200);
    expect(alice!.wins).toBe(1);
    expect(alice!.losses).toBe(0);
    expect(alice!.elo_rating).toBeGreaterThan(1000);
    expect(alice!.current_streak).toBe(1);
    expect(bob!.wins).toBe(0);
    expect(bob!.losses).toBe(1);
    expect(bob!.elo_rating).toBeLessThan(1000);
  });

  it("records a match with set count only", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 2-0",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
    expect(reply).toContain("2-0");
  });

  it("shows error when opponent not found", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/game @nobody 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("nobody");
    expect(reply).toContain("not found");
  });

  it("shows error for self-play", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/game @alice 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply.toLowerCase()).toContain("yourself");
  });

  it("shows group_only error in private chat", async () => {
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatType: "private",
      chatId: 100,
    });

    const reply = lastReply(calls);
    expect(reply).toContain("group");
  });

  it("triggers first_blood achievement on first win", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/game @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("First Blood");
  });
});
