import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/web", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];
  const originalWebUrl = process.env.WEB_URL;

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  afterEach(() => {
    if (originalWebUrl !== undefined) {
      process.env.WEB_URL = originalWebUrl;
    } else {
      delete process.env.WEB_URL;
    }
  });

  it("shows web link when WEB_URL is configured", async () => {
    process.env.WEB_URL = "https://smashrank.example.com";

    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/web",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("smashrank.example.com");
  });

  it("shows not configured when WEB_URL is missing", async () => {
    delete process.env.WEB_URL;

    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/web",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("not configured");
  });

  it("shows group_only error in private chat", async () => {
    await sendMessage(bot, {
      text: "/web",
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
