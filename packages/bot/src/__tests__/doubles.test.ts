import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries, groupQueries } from "@smashrank/db";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/doubles", () => {
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

  it("records a 4-player doubles match", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "charlie", "Charlie");
    await registerPlayer(400, "dave", "Dave");

    await sendMessage(bot, {
      text: "/doubles @bob vs @charlie @dave 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
    expect(reply).toContain("Charlie");
    expect(reply).toContain("Dave");

    // Verify all 4 players' ELO updated via group_members
    const sql = getConnection();
    const players = playerQueries(sql);
    const groups = groupQueries(sql);
    const group = await groups.findByChatId(-1001);
    const alice = await players.findByTelegramId(100);
    const bob = await players.findByTelegramId(200);
    const charlie = await players.findByTelegramId(300);
    const dave = await players.findByTelegramId(400);
    const aliceM = await groups.getGroupMember(group!.id, alice!.id);
    const bobM = await groups.getGroupMember(group!.id, bob!.id);
    const charlieM = await groups.getGroupMember(group!.id, charlie!.id);
    const daveM = await groups.getGroupMember(group!.id, dave!.id);

    // Winners should gain ELO
    expect(aliceM!.elo_rating).toBeGreaterThan(1200);
    expect(bobM!.elo_rating).toBeGreaterThan(1200);
    // Losers should lose ELO
    expect(charlieM!.elo_rating).toBeLessThan(1200);
    expect(daveM!.elo_rating).toBeLessThan(1200);

    // All should have 1 game played
    expect(aliceM!.games_played).toBe(1);
    expect(bobM!.games_played).toBe(1);
    expect(charlieM!.games_played).toBe(1);
    expect(daveM!.games_played).toBe(1);
  });

  it("shows usage when format is wrong", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/doubles @bob 11-7",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply.toLowerCase()).toContain("usage");
  });

  it("shows group_only error in private chat", async () => {
    await sendMessage(bot, {
      text: "/doubles @bob vs @charlie @dave 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatType: "private",
      chatId: 100,
    });

    const reply = lastReply(calls);
    expect(reply).toContain("group");
  });

  it("rejects duplicate players", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "charlie", "Charlie");

    await sendMessage(bot, {
      text: "/doubles @bob vs @alice @charlie 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply.toLowerCase()).toContain("same player");
  });
});
