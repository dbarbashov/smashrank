import { describe, it, expect, beforeEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/help", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  it("shows help text with commands", async () => {
    await sendMessage(bot, {
      text: "/help",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("SmashRank");
    expect(reply).toContain("/game");
    expect(reply).toContain("/challenge");
    expect(reply).toContain("/leaderboard");
    expect(reply).toContain("/stats");
  });
});
