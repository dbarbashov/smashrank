import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/listachievements", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  it("lists all available achievements", async () => {
    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/listachievements",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Available Achievements");
    expect(reply).toContain("First Blood");
    expect(reply).toContain("On Fire");
    expect(reply).toContain("Giant Killer");
    expect(reply).toContain("Iron Man");
  });
});
