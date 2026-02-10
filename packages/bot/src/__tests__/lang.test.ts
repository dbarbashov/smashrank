import { describe, it, expect, beforeEach } from "vitest";
import { getConnection, groupQueries } from "@smashrank/db";
import { createTestBot, sendMessage, lastReply, resetCounters, type CapturedCall } from "./harness.js";
import { cleanDb } from "./setup.js";
import type { Bot } from "grammy";
import type { SmashRankContext } from "../context.js";

describe("/lang", () => {
  let bot: Bot<SmashRankContext>;
  let calls: CapturedCall[];

  beforeEach(async () => {
    await cleanDb();
    resetCounters();
    ({ bot, calls } = createTestBot());
  });

  it("changes group language to Russian", async () => {
    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/lang ru",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    // Response should be in Russian
    expect(reply).toContain("русский");

    // Verify DB
    const sql = getConnection();
    const group = await groupQueries(sql).findByChatId(-1001);
    expect(group!.language).toBe("ru");
  });

  it("shows error for unsupported language", async () => {
    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/lang fr",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Unknown language");
  });

  it("shows error when no language specified", async () => {
    await sendMessage(bot, { text: "/start", userId: 100, username: "alice", displayName: "Alice" });
    calls.length = 0;

    await sendMessage(bot, {
      text: "/lang",
      userId: 100,
      username: "alice",
      displayName: "Alice",
    });

    const reply = lastReply(calls);
    expect(reply).toContain("Unknown language");
  });
});
