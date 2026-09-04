import { beforeEach, describe, expect, it } from "vitest";
import {
  achievementQueries,
  backfillAchievements,
  getConnection,
  matchQueries,
} from "@smashrank/db";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";
import {
  createTestBot,
  resetCounters,
  sendMessage,
  type CapturedCall,
} from "./harness.js";
import { cleanDb } from "./setup.js";

describe("achievement backfill", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  async function register(userId: number, username: string, displayName: string) {
    await sendMessage(bot, { text: "/start", userId, username, displayName, chatId: -1001 });
    calls.length = 0;
  }

  async function loadGroupAndPlayers(usernames: string[]) {
    const sql = getConnection();
    const [group] = await sql<{ id: string }[]>`
      SELECT id FROM groups WHERE chat_id = -1001
    `;
    const players = await sql<{ id: string; telegram_username: string }[]>`
      SELECT id, telegram_username
      FROM players
      WHERE telegram_username IN ${sql(usernames)}
    `;
    const byUsername = new Map(players.map((player) => [player.telegram_username, player.id]));
    const [season] = await sql<{ id: string }[]>`
      INSERT INTO seasons (group_id, name, start_date, end_date)
      VALUES (${group.id}, 'Test season', '2026-09-01', '2026-09-30')
      RETURNING id
    `;
    return { sql, groupId: group.id, seasonId: season.id, byUsername };
  }

  it("is silent and idempotent across repeated runs", async () => {
    await register(100, "alice", "Alice");
    await register(200, "bob", "Bob");
    await sendMessage(bot, {
      text: "/game @bob 11-0 11-7",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatId: -1001,
    });

    const sql = getConnection();
    await sql`DELETE FROM player_achievements`;
    calls.length = 0;

    await backfillAchievements();
    const afterFirst = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM player_achievements
    `;
    await backfillAchievements();
    const afterSecond = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM player_achievements
    `;

    expect(afterFirst[0].count).toBeGreaterThan(0);
    expect(afterSecond[0].count).toBe(afterFirst[0].count);
    expect(calls).toEqual([]);
  });

  it("keeps tournament losses out of broke_the_wall in live queries and backfill", async () => {
    await register(100, "alice", "Alice");
    await register(200, "bob", "Bob");
    const { sql, groupId, seasonId, byUsername } = await loadGroupAndPlayers(["alice", "bob"]);
    const aliceId = byUsername.get("alice")!;
    const bobId = byUsername.get("bob")!;

    for (let index = 0; index < 5; index += 1) {
      await sql`
        INSERT INTO matches (
          match_type, season_id, group_id, winner_id, loser_id,
          winner_score, loser_score, elo_before_winner, elo_before_loser,
          elo_change, reported_by, played_at
        ) VALUES (
          'tournament', ${seasonId}, ${groupId}, ${bobId}, ${aliceId},
          2, 0, 1000, 1000, 10, ${bobId},
          ${new Date(`2026-09-04T0${index + 5}:00:00Z`)}
        )
      `;
    }
    const singlesPlayedAt = new Date("2026-09-04T12:00:00Z");
    await sql`
      INSERT INTO matches (
        match_type, season_id, group_id, winner_id, loser_id,
        winner_score, loser_score, elo_before_winner, elo_before_loser,
        elo_change, reported_by, played_at
      ) VALUES (
        'singles', ${seasonId}, ${groupId}, ${aliceId}, ${bobId},
        2, 0, 1000, 1000, 10, ${aliceId}, ${singlesPlayedAt}
      )
    `;

    expect(await matchQueries(sql).getConsecutiveLossesAgainst(
      aliceId,
      bobId,
      groupId,
      singlesPlayedAt,
    )).toBe(0);

    await backfillAchievements(new Date("2026-09-05T12:00:00Z"));
    expect(await achievementQueries(sql).getPlayerAchievementIds(aliceId, groupId))
      .not.toContain("broke_the_wall");
  });

  it("keeps tournament defences out of throne_defender streaks", async () => {
    await register(100, "alice", "Alice");
    await register(200, "bob", "Bob");
    const { sql, groupId, seasonId, byUsername } = await loadGroupAndPlayers(["alice", "bob"]);
    const aliceId = byUsername.get("alice")!;
    const bobId = byUsername.get("bob")!;

    for (const [index, matchType] of ["tournament", "tournament", "singles"].entries()) {
      const hour = String(index + 8).padStart(2, "0");
      await sql`
        INSERT INTO matches (
          match_type, season_id, group_id, winner_id, loser_id,
          winner_score, loser_score, elo_before_winner, elo_before_loser,
          elo_change, reported_by, played_at, winner_rank_before, loser_rank_before
        ) VALUES (
          ${matchType}, ${seasonId}, ${groupId}, ${aliceId}, ${bobId},
          2, 0, 1000, 1000, 10, ${aliceId},
          ${new Date(`2026-09-04T${hour}:00:00Z`)}, 1, 2
        )
      `;
    }

    expect(await matchQueries(sql).getTopTwoDefenceStreak(aliceId, groupId)).toBe(1);
  });

  it("does not treat a stored tournament draw as a win during backfill", async () => {
    await register(100, "alice", "Alice");
    await register(200, "bob", "Bob");
    await register(300, "carol", "Carol");
    const { sql, groupId, seasonId, byUsername } = await loadGroupAndPlayers(["alice", "bob", "carol"]);
    const aliceId = byUsername.get("alice")!;
    const bobId = byUsername.get("bob")!;
    const carolId = byUsername.get("carol")!;
    await sql`
      UPDATE group_members SET opted_out = TRUE
      WHERE group_id = ${groupId} AND player_id = ${carolId}
    `;
    await sql`
      INSERT INTO matches (
        match_type, season_id, group_id, winner_id, loser_id,
        winner_score, loser_score, elo_before_winner, elo_before_loser,
        elo_change, reported_by, played_at
      ) VALUES
        ('tournament', ${seasonId}, ${groupId}, ${aliceId}, ${bobId}, 1, 1, 1000, 1200, 0, ${aliceId}, '2026-09-04T08:00:00Z'),
        ('singles', ${seasonId}, ${groupId}, ${carolId}, ${aliceId}, 2, 0, 800, 1000, 10, ${carolId}, '2026-09-04T09:00:00Z')
    `;

    await backfillAchievements(new Date("2026-09-05T12:00:00Z"));
    const aliceAchievements = await achievementQueries(sql).getPlayerAchievementIds(aliceId, groupId);
    expect(aliceAchievements).not.toEqual(expect.arrayContaining(["collector", "robin_hood"]));
  });

  it("reconstructs match meta achievements when their primary awards already exist", async () => {
    await register(100, "alice", "Alice");
    await register(200, "bob", "Bob");
    await sendMessage(bot, {
      text: "/game @bob 11-0 0-11 11-0 0-11 11-0",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatId: -1001,
    });
    const sql = getConnection();
    const [group] = await sql<{ id: string }[]>`SELECT id FROM groups WHERE chat_id = -1001`;
    const [bob] = await sql<{ id: string }[]>`SELECT id FROM players WHERE telegram_username = 'bob'`;
    await sql`
      DELETE FROM player_achievements
      WHERE achievement_id IN ('jackpot', 'hero_and_villain')
    `;

    await backfillAchievements();
    expect(await achievementQueries(sql).getPlayerAchievementIds(bob.id, group.id)).toEqual(
      expect.arrayContaining(["jackpot", "hero_and_villain"]),
    );
  });

  it("stores only each player's own primary triggers in meta sources", async () => {
    await register(100, "alice", "Alice");
    await register(200, "bob", "Bob");
    await sendMessage(bot, {
      text: "/game @bob 11-8 11-8",
      userId: 100,
      username: "alice",
      displayName: "Alice",
      chatId: -1001,
    });
    const sql = getConnection();
    const [group] = await sql<{ id: string }[]>`SELECT id FROM groups WHERE chat_id = -1001`;
    const players = await sql<{ id: string; telegram_username: string }[]>`
      SELECT id, telegram_username FROM players WHERE telegram_username IN ('alice', 'bob')
    `;
    const byUsername = new Map(players.map((player) => [player.telegram_username, player.id]));
    const [recordedMatch] = await sql<{ id: string }[]>`
      SELECT id FROM matches WHERE group_id = ${group.id} ORDER BY played_at DESC LIMIT 1
    `;
    await sql`DELETE FROM player_achievements`;

    const alicePrimary = ["perfect_game", "stolen_victory", "groundhog_day"];
    const bobPrimary = ["perfect_game", "glass_cannon", "humbled"];
    await achievementQueries(sql).awardWithMeta(group.id, [
      ...alicePrimary.map((achievementId) => ({ playerId: byUsername.get("alice")!, achievementId })),
      ...bobPrimary.map((achievementId) => ({ playerId: byUsername.get("bob")!, achievementId })),
    ], { type: "match", id: recordedMatch.id });

    const jackpotRows = await sql<{
      player_id: string;
      meta_context: { trigger_achievement_ids: string[] };
    }[]>`
      SELECT player_id, meta_context
      FROM player_achievements
      WHERE achievement_id = 'jackpot'
    `;
    const triggersByPlayer = new Map(jackpotRows.map((row) => [
      row.player_id,
      new Set(row.meta_context.trigger_achievement_ids),
    ]));
    expect(triggersByPlayer.get(byUsername.get("alice")!)).toEqual(new Set(alicePrimary));
    expect(triggersByPlayer.get(byUsername.get("bob")!)).toEqual(new Set(bobPrimary));
  });
});
