import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/settings", () => {
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

  it("shows current default settings including matchup_of_day and elo_decay", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, { text: "/settings", userId: 100, username: "alice", displayName: "Alice" });
    const reply = lastReply(calls);
    expect(reply).toContain("Commentary: on");
    expect(reply).toContain("Achievements: on");
    expect(reply).toContain("Digest: off");
    expect(reply).toContain("Matchup of the Day: off");
    expect(reply).toContain("ELO Decay: off");
  });

  it("updates commentary setting", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/settings commentary off",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    let reply = lastReply(calls);
    expect(reply).toContain("updated");
    calls.length = 0;

    // Verify the change persisted
    await sendMessage(bot, { text: "/settings", userId: 100, username: "alice", displayName: "Alice" });
    reply = lastReply(calls);
    expect(reply).toContain("Commentary: off");
  });

  it("disabling achievements prevents achievement unlocks", async () => {
    await registerPlayer(100, "alice", "Alice");
    await registerPlayer(200, "bob", "Bob");

    // Disable achievements
    await sendMessage(bot, {
      text: "/settings achievements off",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    calls.length = 0;

    // Play a game
    await sendMessage(bot, {
      text: "/game @bob 11-5 11-3",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    const reply = lastReply(calls);

    // Should NOT contain achievement text
    expect(reply).not.toContain("First Blood");
    calls.length = 0;

    // Verify no achievements in DB
    await sendMessage(bot, { text: "/achievements", userId: 100, username: "alice", displayName: "Alice" });
    const achReply = lastReply(calls);
    expect(achReply).toContain("no achievements");
  });

  it("updates matchup_of_day setting", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/settings matchup_of_day on",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    let reply = lastReply(calls);
    expect(reply).toContain("updated");
    calls.length = 0;

    // Verify the change persisted
    await sendMessage(bot, { text: "/settings", userId: 100, username: "alice", displayName: "Alice" });
    reply = lastReply(calls);
    expect(reply).toContain("Matchup of the Day: on");
  });

  it("updates elo_decay setting", async () => {
    await registerPlayer(100, "alice", "Alice");

    await sendMessage(bot, {
      text: "/settings elo_decay on",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });
    let reply = lastReply(calls);
    expect(reply).toContain("updated");
    calls.length = 0;

    // Verify the change persisted
    await sendMessage(bot, { text: "/settings", userId: 100, username: "alice", displayName: "Alice" });
    reply = lastReply(calls);
    expect(reply).toContain("ELO Decay: on");
  });

  it("shows group_only error in private chat", async () => {
    await sendMessage(bot, {
      text: "/settings",
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
