import type { Bot } from "grammy";
import {
  getConnection,
  groupQueries,
  digestQueries,
  tournamentQueries,
} from "@smashrank/db";
import {
  getT,
  generateDigestCommentary,
  formatDigestFallback,
} from "@smashrank/core";
import type { DigestData } from "@smashrank/core";
import type { SmashRankContext } from "./context.js";
import { forceCompleteTournament } from "./helpers/force-complete-tournament.js";

const DIGEST_INTERVAL_MS = 60_000; // Check every 60 seconds
const lastDigestSent = new Map<string, number>(); // groupId → timestamp

function getDigestIntervalMs(digest: string): number {
  if (digest === "daily") return 24 * 60 * 60 * 1000;
  if (digest === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return 0;
}

async function checkAndSendDigests(bot: Bot<SmashRankContext>): Promise<void> {
  try {
    const sql = getConnection();
    const groups = groupQueries(sql);
    const digest = digestQueries(sql);

    const eligibleGroups = await groups.getAllGroupsWithDigest();

    for (const group of eligibleGroups) {
      const digestSetting = group.settings?.digest as string;
      if (!digestSetting || digestSetting === "off") continue;

      const interval = getDigestIntervalMs(digestSetting);
      if (interval === 0) continue;

      const lastSent = lastDigestSent.get(group.id) ?? 0;
      const now = Date.now();

      if (now - lastSent < interval) continue;

      // Time to send a digest
      const since = new Date(now - interval);
      const stats = await digest.getWeeklyStats(group.id, since);

      if (stats.matchCount === 0) {
        lastDigestSent.set(group.id, now);
        continue;
      }

      const digestData: DigestData = {
        groupName: group.name ?? "Group",
        ...stats,
      };

      const lang = group.language ?? "en";
      const t = getT(lang);

      const llmMessage = await generateDigestCommentary(digestData, lang);
      const message = llmMessage ?? formatDigestFallback(digestData, t);

      try {
        await bot.api.sendMessage(group.chat_id, message);
      } catch {
        // Group might have kicked the bot — ignore
      }

      lastDigestSent.set(group.id, now);
    }
  } catch (err) {
    console.error("Digest scheduler error:", err);
  }
}

async function checkStaleTournaments(bot: Bot<SmashRankContext>): Promise<void> {
  try {
    const sql = getConnection();
    const tournaments = tournamentQueries(sql);
    const groups = groupQueries(sql);

    const stale = await tournaments.findStaleTournaments(14);

    for (const tournament of stale) {
      const group = await groups.findById(tournament.group_id);
      if (!group) continue;

      const result = await forceCompleteTournament(tournament, group.id);
      const lang = group.language ?? "en";
      const t = getT(lang);

      let message = t("tournament.auto_completed", {
        name: tournament.name,
        forfeited: result.forfeitedFixtures,
      });

      if (result.winnerName) {
        message += "\n" + t("tournament.champion", { name: result.winnerName });
      }

      try {
        await bot.api.sendMessage(group.chat_id, message);
      } catch {
        // Group might have kicked the bot
      }
    }
  } catch (err) {
    console.error("Tournament stale check error:", err);
  }
}

export function startScheduler(bot: Bot<SmashRankContext>): void {
  setInterval(() => {
    checkAndSendDigests(bot).catch((err) =>
      console.error("Digest scheduler error:", err),
    );
    checkStaleTournaments(bot).catch((err) =>
      console.error("Tournament stale check error:", err),
    );
  }, DIGEST_INTERVAL_MS);
  console.log("Digest scheduler started.");
}
