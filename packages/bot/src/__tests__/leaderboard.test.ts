import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/leaderboard", () => {
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

  it("shows empty leaderboard when no matches played", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/leaderboard", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("No matches");
  });

  it("shows ranked list after games", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Alice beats Bob
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, { text: "/leaderboard", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);

    // Alice should be ranked #1
    expect(reply).toContain("1.");
    expect(reply).toContain("Alice");
    expect(reply).toContain("2.");
    expect(reply).toContain("Bob");
  });

  it("shows tier emoji in leaderboard rows", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Alice beats Bob
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, { text: "/leaderboard", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);

    // Default ELO ~1200 is Gold tier — gold medal emoji
    expect(reply).toContain("\u{1F947}");
  });

  it("shows doubles leaderboard after doubles games", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");
    await registerPlayer(300, "charlie", "Charlie");
    await registerPlayer(400, "dave", "Dave");

    // Alice+Bob beat Charlie+Dave
    await sendMessage(bot, {
      text: "/doubles @bob vs @charlie @dave 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, { text: "/leaderboard doubles", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);

    expect(reply).toContain("Doubles Rankings");
    expect(reply).toContain("Alice");
    expect(reply).toContain("Bob");
  });

  it("shows empty message for /leaderboard doubles when no doubles played", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Play only a singles game
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    await sendMessage(bot, { text: "/leaderboard doubles", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);

    expect(reply).toContain("No matches");
  });
});
