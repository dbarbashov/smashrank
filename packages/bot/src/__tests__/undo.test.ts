import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries, achievementQueries, groupQueries } from "@smashrank/db";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/undo", () => {
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

  it("undoes last match and restores ELO", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Record a game
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    // Undo
    await sendMessage(bot, { text: "/undo", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("undone");
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");

    // Verify ELO restored via group_members
    const sql = getConnection();
    const players = playerQueries(sql);
    const groups = groupQueries(sql);
    const alice = await players.findByTelegramId(100);
    const bob = await players.findByTelegramId(200);
    const group = await groups.findByChatId(-1001);
    const aliceMember = await groups.getGroupMember(group!.id, alice!.id);
    const bobMember = await groups.getGroupMember(group!.id, bob!.id);
    expect(aliceMember!.elo_rating).toBe(1200);
    expect(aliceMember!.wins).toBe(0);
    expect(aliceMember!.games_played).toBe(0);
    expect(bobMember!.elo_rating).toBe(1200);
    expect(bobMember!.losses).toBe(0);
    expect(bobMember!.games_played).toBe(0);
  });

  it("undoes achievements from the match", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Record a game (triggers first_blood)
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const sql = getConnection();
    const achievements = achievementQueries(sql);
    const before = await achievements.getPlayerAchievementIds(
      (await playerQueries(sql).findByTelegramId(100))!.id,
    );
    expect(before).toContain("first_blood");

    calls.length = 0;

    // Undo
    await sendMessage(bot, { text: "/undo", userId: 100, username: "alice", displayName: "Alice" });

    const after = await achievements.getPlayerAchievementIds(
      (await playerQueries(sql).findByTelegramId(100))!.id,
    );
    expect(after).not.toContain("first_blood");
  });

  it("shows error when no match to undo", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/undo", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("No recent match");
  });
});
