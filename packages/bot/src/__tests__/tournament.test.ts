import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, playerQueries, tournamentQueries, achievementQueries, groupQueries } from "@smashrank/db";
import { createTestBot, sendMessage, lastReply, getSentMessages, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/tournament", () => {
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
    calls.length = 0;
  }

  it("shows help with no subcommand", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/tournament",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("/tournament create");
    expect(reply).toContain("/tgame");
  });

  it("creates a tournament", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/tournament create Spring Cup",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Spring Cup");
    expect(reply).toContain("Alice");

    // Creator auto-joined
    const sql = getConnection();
    const tournaments = tournamentQueries(sql);
    const alice = await playerQueries(sql).findByTelegramId(100);
    const t = await tournaments.findActiveByGroup(alice!.id); // will use group
    // Just verify tournament exists in DB
    const list = await sql`SELECT * FROM tournaments WHERE name = 'Spring Cup'`;
    expect(list.length).toBe(1);
    expect(list[0].status).toBe("open");
  });

  it("prevents creating two active tournaments", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/tournament create Cup 1",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/tournament create Cup 2",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("already");
  });

  it("allows join/leave for open tournament", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/tournament create Cup",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    // Bob joins
    await sendMessage(bot, {
      text: "/tournament join",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });
    let reply = lastReply(calls);
    expect(reply).toContain("Bob");
    expect(reply).toContain("2 players");
    calls.length = 0;

    // Bob leaves
    await sendMessage(bot, {
      text: "/tournament leave",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });
    reply = lastReply(calls);
    expect(reply).toContain("Bob");
    expect(reply).toContain("left");
  });

  it("prevents joining twice", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/tournament create Cup",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    // Alice already auto-joined on create
    await sendMessage(bot, {
      text: "/tournament join",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    const reply = lastReply(calls);
    expect(reply).toContain("already");
  });

  it("requires minimum 3 players to start", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/tournament create Cup",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    await sendMessage(bot, {
      text: "/tournament join",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/tournament start",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("3");
    expect(reply).toContain("2"); // currently 2
  });

  it("starts a tournament with 3 players", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");

    await sendMessage(bot, {
      text: "/tournament create Cup",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    await sendMessage(bot, {
      text: "/tournament join",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });
    await sendMessage(bot, {
      text: "/tournament join",
      userId: 300,
      username: "carol",
      displayName: "Carol",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/tournament start",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("started");
    expect(reply).toContain("3 players");
    expect(reply).toContain("3 fixtures");

    // Verify DB
    const sql = getConnection();
    const list = await sql`SELECT * FROM tournaments WHERE status = 'active'`;
    expect(list.length).toBe(1);
    const standings = await sql`SELECT * FROM tournament_standings WHERE tournament_id = ${list[0].id}`;
    expect(standings.length).toBe(3);
  });

  it("prevents join/leave after tournament started", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");
    await registerPlayer(400, "dave", "Dave");

    await sendMessage(bot, { text: "/tournament create Cup", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/tournament join", userId: 200, username: "bob", displayName: "Bob" });
    await sendMessage(bot, { text: "/tournament join", userId: 300, username: "carol", displayName: "Carol" });
    await sendMessage(bot, { text: "/tournament start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    // Dave tries to join after start
    await sendMessage(bot, { text: "/tournament join", userId: 400, username: "dave", displayName: "Dave" });
    expect(lastReply(calls)).toContain("already started");
    calls.length = 0;

    // Bob tries to leave after start
    await sendMessage(bot, { text: "/tournament leave", userId: 200, username: "bob", displayName: "Bob" });
    expect(lastReply(calls)).toContain("already started");
  });

  it("shows standings for active tournament", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");

    await sendMessage(bot, { text: "/tournament create Cup", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/tournament join", userId: 200, username: "bob", displayName: "Bob" });
    await sendMessage(bot, { text: "/tournament join", userId: 300, username: "carol", displayName: "Carol" });
    await sendMessage(bot, { text: "/tournament start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, { text: "/tournament standings", userId: 100, username: "alice", displayName: "Alice" });

    const reply = lastReply(calls);
    expect(reply).toContain("Standings");
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
    expect(reply).toContain("Carol");
    expect(reply).toContain("0pts");
  });

  it("shows fixtures for active tournament", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");

    await sendMessage(bot, { text: "/tournament create Cup", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/tournament join", userId: 200, username: "bob", displayName: "Bob" });
    await sendMessage(bot, { text: "/tournament join", userId: 300, username: "carol", displayName: "Carol" });
    await sendMessage(bot, { text: "/tournament start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, { text: "/tournament fixtures", userId: 100, username: "alice", displayName: "Alice" });

    const reply = lastReply(calls);
    expect(reply).toContain("Fixtures");
    // All 3 fixtures should be pending
    const pendingCount = (reply.match(/⏳/g) || []).length;
    expect(pendingCount).toBe(3);
  });

  it("force-completes with /tournament end", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");

    await sendMessage(bot, { text: "/tournament create Cup", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/tournament join", userId: 200, username: "bob", displayName: "Bob" });
    await sendMessage(bot, { text: "/tournament join", userId: 300, username: "carol", displayName: "Carol" });
    await sendMessage(bot, { text: "/tournament start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, { text: "/tournament end", userId: 100, username: "alice", displayName: "Alice" });

    const reply = lastReply(calls);
    expect(reply).toContain("force-completed");
    expect(reply).toContain("3"); // 3 forfeited fixtures
    expect(reply).toContain("Champion");

    // Verify DB: tournament completed
    const sql = getConnection();
    const list = await sql`SELECT * FROM tournaments WHERE status = 'completed'`;
    expect(list.length).toBe(1);
  });

  it("cancels an open tournament with /tournament end", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/tournament create Cup", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, { text: "/tournament end", userId: 100, username: "alice", displayName: "Alice" });

    const reply = lastReply(calls);
    expect(reply).toContain("cancelled");
  });

  it("shows error in private chat", async () => {
    await sendMessage(bot, {
      text: "/tournament create Cup",
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

describe("/tgame", () => {
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
    calls.length = 0;
  }

  async function setupTournament() {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "carol", "Carol");

    await sendMessage(bot, { text: "/tournament create Cup", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/tournament join", userId: 200, username: "bob", displayName: "Bob" });
    await sendMessage(bot, { text: "/tournament join", userId: 300, username: "carol", displayName: "Carol" });
    await sendMessage(bot, { text: "/tournament start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;
  }

  it("records a tournament win", async () => {
    await setupTournament();

    await sendMessage(bot, {
      text: "/tgame @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
    expect(reply).toContain("beat");
    expect(reply).toContain("Remaining fixtures: 2");

    // Verify DB: alice won (group-scoped stats)
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const groups = groupQueries(sql);
    const group = await groups.findByChatId(-1001);
    const aliceMember = await groups.getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.wins).toBe(1);
    expect(aliceMember!.elo_rating).toBeGreaterThan(1200);

    // Check standings
    const tournament = await sql`SELECT * FROM tournaments WHERE status = 'active'`;
    const standings = await sql`
      SELECT * FROM tournament_standings
      WHERE tournament_id = ${tournament[0].id}
      ORDER BY points DESC
    `;
    const aliceStanding = standings.find((s: any) => s.player_id === alice!.id);
    expect(aliceStanding!.points).toBe(3);
    expect(aliceStanding!.wins).toBe(1);
  });

  it("records a tournament draw", async () => {
    await setupTournament();

    await sendMessage(bot, {
      text: "/tgame @bob 11-7 7-11 11-8 8-11",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("drew");
    expect(reply).toContain("1 point each");

    // Verify DB: both got 1 point
    const sql = getConnection();
    const tournament = await sql`SELECT * FROM tournaments WHERE status = 'active'`;
    const standings = await sql`
      SELECT * FROM tournament_standings
      WHERE tournament_id = ${tournament[0].id}
    `;
    for (const s of standings) {
      const alice = await playerQueries(sql).findByTelegramId(100);
      const bob = await playerQueries(sql).findByTelegramId(200);
      if (s.player_id === alice!.id || s.player_id === bob!.id) {
        expect(s.points).toBe(1);
        expect(s.draws).toBe(1);
      }
    }

    // Streaks should be reset to 0 (group-scoped)
    const groups2 = groupQueries(sql);
    const grp = await groups2.findByChatId(-1001);
    const alicePlayer = await playerQueries(sql).findByTelegramId(100);
    const aliceMbr = await groups2.getGroupMember(grp!.id, alicePlayer!.id);
    expect(aliceMbr!.current_streak).toBe(0);
  });

  it("prevents duplicate fixture play", async () => {
    await setupTournament();

    await sendMessage(bot, {
      text: "/tgame @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    // Try same fixture again
    await sendMessage(bot, {
      text: "/tgame @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("already been played");
  });

  it("prevents non-participant from reporting", async () => {
    await setupTournament();
    await registerPlayer(400, "dave", "Dave");

    await sendMessage(bot, {
      text: "/tgame @bob 11-7 11-5",
      userId: 400,
      username: "dave",
      displayName: "Dave",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("not a participant");
  });

  it("prevents reporting against non-participant", async () => {
    await setupTournament();
    await registerPlayer(400, "dave", "Dave");

    await sendMessage(bot, {
      text: "/tgame @dave 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("not a participant");
  });

  it("shows error when no active tournament", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    await sendMessage(bot, {
      text: "/tgame @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("No active tournament");
  });

  it("completes tournament after all fixtures played", async () => {
    await setupTournament();

    // Play all 3 fixtures: Alice vs Bob, Alice vs Carol, Bob vs Carol
    await sendMessage(bot, {
      text: "/tgame @bob 11-7 11-5",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/tgame @carol 11-3 11-6",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/tgame @carol 11-9 11-8",
      userId: 200,
      username: "bob",
      displayName: "Bob",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Remaining fixtures: 0");
    expect(reply).toContain("complete");
    expect(reply).toContain("Champion");
    expect(reply).toContain("Alice"); // Alice won all, should be champion

    // Verify DB: tournament completed
    const sql = getConnection();
    const tournament = await sql`SELECT * FROM tournaments WHERE status = 'completed'`;
    expect(tournament.length).toBe(1);

    // Verify Alice got 6 pts, Bob 3 pts, Carol 0 pts
    const standings = await sql`
      SELECT ts.*, p.display_name
      FROM tournament_standings ts
      JOIN players p ON p.id = ts.player_id
      WHERE ts.tournament_id = ${tournament[0].id}
      ORDER BY ts.points DESC
    `;
    expect(standings[0].display_name).toBe("Alice");
    expect(standings[0].points).toBe(6);
    expect(standings[1].display_name).toBe("Bob");
    expect(standings[1].points).toBe(3);
    expect(standings[2].display_name).toBe("Carol");
    expect(standings[2].points).toBe(0);
  });

  it("grants tournament achievements on completion", async () => {
    await setupTournament();

    // Alice beats everyone (champion + undefeated)
    await sendMessage(bot, { text: "/tgame @bob 11-7 11-5", userId: 100, username: "alice", displayName: "Alice" });
    await sendMessage(bot, { text: "/tgame @carol 11-3 11-6", userId: 100, username: "alice", displayName: "Alice" });
    // Bob beats Carol (completes tournament)
    await sendMessage(bot, { text: "/tgame @carol 11-9 11-8", userId: 200, username: "bob", displayName: "Bob" });

    // Verify achievements
    const sql = getConnection();
    const alice = await playerQueries(sql).findByTelegramId(100);
    const achievements = achievementQueries(sql);
    const aliceAchievements = await achievements.getPlayerAchievementIds(alice!.id);

    expect(aliceAchievements).toContain("tournament_champion");
    expect(aliceAchievements).toContain("tournament_undefeated");
    expect(aliceAchievements).toContain("tournament_ironman");
  });

  it("records a loss for the reporter", async () => {
    await setupTournament();

    // Alice reports losing to Bob
    await sendMessage(bot, {
      text: "/tgame @bob 5-11 7-11",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Bob");
    expect(reply).toContain("beat");
    expect(reply).toContain("Alice");

    // Verify DB: Bob won (group-scoped stats)
    const sql = getConnection();
    const groups = groupQueries(sql);
    const group = await groups.findByChatId(-1001);
    const bob = await playerQueries(sql).findByTelegramId(200);
    const bobMember = await groups.getGroupMember(group!.id, bob!.id);
    expect(bobMember!.wins).toBe(1);
    expect(bobMember!.elo_rating).toBeGreaterThan(1200);

    const alice = await playerQueries(sql).findByTelegramId(100);
    const aliceMember = await groups.getGroupMember(group!.id, alice!.id);
    expect(aliceMember!.losses).toBe(1);
    expect(aliceMember!.elo_rating).toBeLessThan(1200);
  });

  it("records a draw with set count only", async () => {
    await setupTournament();

    await sendMessage(bot, {
      text: "/tgame @bob 2-2",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("drew");
    expect(reply).toContain("1 point each");
  });
});
