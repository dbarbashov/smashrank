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
    const group = await groupQueries(sql).findByChatId(-1001);
    const before = await achievements.getPlayerAchievementIds(
      (await playerQueries(sql).findByTelegramId(100))!.id,
      group!.id,
    );
    expect(before).toContain("first_blood");

    calls.length = 0;

    // Undo
    await sendMessage(bot, { text: "/undo", userId: 100, username: "alice", displayName: "Alice" });

    const after = await achievements.getPlayerAchievementIds(
      (await playerQueries(sql).findByTelegramId(100))!.id,
      group!.id,
    );
    expect(after).not.toContain("first_blood");
  });

  it("does not undo a match reported in a different group", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await sendMessage(bot, { text: "/game @bob 11-5 11-3", userId: 100,
      username: "alice", displayName: "Alice", chatId: -1001 });
    await sendMessage(bot, { text: "/undo", userId: 100,
      username: "alice", displayName: "Alice", chatId: -2002 });
    expect(lastReply(calls)).toContain("No recent match");
    const rows = await getConnection()`SELECT id FROM matches`;
    expect(rows).toHaveLength(1);
  });

  it("removes tournament and derived meta awards when reopening the tournament", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");
    const alice = { userId: 100, username: "alice", displayName: "Alice" };
    const bob = { userId: 200, username: "bob", displayName: "Bob" };
    await sendMessage(bot, { ...alice, text: "/tournament create Cup" });
    await sendMessage(bot, { ...bob, text: "/tournament join" });
    await sendMessage(bot, { userId: 300, username: "carol", displayName: "Carol", text: "/tournament join" });
    await sendMessage(bot, { ...alice, text: "/tournament start" });
    await sendMessage(bot, { ...alice, text: "/tgame @bob 11-5 11-3" });
    await sendMessage(bot, { ...alice, text: "/tgame @carol 11-5 11-3" });
    await sendMessage(bot, { ...bob, text: "/tgame @carol 11-5 11-3" });
    const sql = getConnection();
    const [tournament] = await sql`SELECT id, group_id, status FROM tournaments`;
    expect(tournament.status).toBe("completed");
    const [champion] = await sql`SELECT player_id FROM player_achievements
      WHERE tournament_id = ${tournament.id} AND achievement_id = 'tournament_champion'`;
    expect(champion).toBeDefined();
    await achievementQueries(sql).awardMany(tournament.group_id,
      [{ playerId: champion.player_id, achievementId: "full_collection" }],
      { type: "meta", context: { tournament_id: tournament.id } });
    await sendMessage(bot, { ...bob, text: "/undo" });
    expect(lastReply(calls)).toContain("undone");
    expect((await sql`SELECT status FROM tournaments WHERE id = ${tournament.id}`)[0].status).toBe("active");
    expect(await sql`SELECT id FROM player_achievements WHERE tournament_id = ${tournament.id}
      OR meta_context->>'tournament_id' = ${tournament.id}`).toHaveLength(0);
    expect((await sql`SELECT COUNT(*)::int AS count FROM matches`)[0].count).toBe(2);
  });

  it("shows error when no match to undo", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/undo", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("No recent match");
  });
});
