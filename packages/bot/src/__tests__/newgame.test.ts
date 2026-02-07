import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries, groupQueries } from "@smashrank/db";
import { createTestBot, sendMessage, sendCallback, lastReply, getSentMessages, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/newgame", () => {
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

  async function playMatch(reporterId: number, reporterUsername: string, reporterName: string, opponentUsername: string) {
    await sendMessage(bot, {
      text: `/game @${opponentUsername} 11-5 11-3`,
      userId: reporterId,
      username: reporterUsername,
      displayName: reporterName,
    });
    calls.length = 0;
  }

  it("completes a full guided flow", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Need a prior match so bob appears as a recent opponent
    await playMatch(100, "alice", "Alice", "bob");

    // Get Bob's player ID from DB
    const sql = getConnection();
    const players = playerQueries(sql);
    const bob = await players.findByTelegramId(200);

    // Step 1: /newgame shows opponent list
    await sendMessage(bot, { text: "/newgame", userId: 100, username: "alice", displayName: "Alice" });
    const step1 = getSentMessages(calls);
    expect(step1.length).toBe(1);
    expect(step1[0].reply_markup).toBeDefined();
    calls.length = 0;

    // Step 2: Pick opponent
    await sendCallback(bot, { data: `ng:opp:${bob!.id}`, userId: 100, username: "alice", displayName: "Alice" });
    const editCalls = calls.filter((c) => c.method === "editMessageText");
    expect(editCalls.length).toBe(1);
    expect(editCalls[0].payload.text).toContain("Bob");
    calls.length = 0;

    // Step 3: Pick winner ("I won")
    await sendCallback(bot, { data: `ng:win:${bob!.id}:me`, userId: 100, username: "alice", displayName: "Alice" });
    const scoreCalls = calls.filter((c) => c.method === "editMessageText");
    expect(scoreCalls.length).toBe(1);
    calls.length = 0;

    // Step 4: Enter score as plain text
    await sendMessage(bot, { text: "11-7 11-5", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");

    // Verify match recorded in DB — alice now has 2 wins (1 setup + 1 newgame)
    const groups = groupQueries(sql);
    const group = await groups.findByChatId(-1001);
    const aliceAfter = await players.findByTelegramId(100);
    const aliceMember = await groups.getGroupMember(group!.id, aliceAfter!.id);
    expect(aliceMember!.wins).toBe(2);
  });

  it("shows no_opponents when no prior matches", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/newgame", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("No recent opponents");
  });
});
