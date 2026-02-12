import type { Bot } from "grammy";
import {
  getConnection,
  groupQueries,
  digestQueries,
  tournamentQueries,
  matchupQueries,
} from "@smashrank/db";
import {
  getT,
  generateDigestCommentary,
  formatDigestFallback,
  generateMatchupCommentary,
} from "@smashrank/core";
import type { DigestData } from "@smashrank/core";
import type { SmashRankContext } from "./context.js";
import { forceCompleteTournament } from "./helpers/force-complete-tournament.js";
import { cleanupExpiredChallenges } from "./commands/challenge.js";
import { cleanupExpiredConfirmations } from "./helpers/match-confirmation.js";

const DIGEST_INTERVAL_MS = 60_000; // Check every 60 seconds
const lastDigestSent = new Map<string, number>(); // groupId → timestamp
const lastMatchupSent = new Map<string, number>(); // groupId → timestamp
const MATCHUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DECAY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DECAY_PER_WEEK = 5;
const DECAY_FLOOR = 800;
const DECAY_INACTIVE_DAYS = 14;
const lastDecayApplied = new Map<string, number>(); // groupId → timestamp

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

async function checkAndSendMatchups(bot: Bot<SmashRankContext>): Promise<void> {
  try {
    const sql = getConnection();
    const groups = groupQueries(sql);
    const matchup = matchupQueries(sql);

    const eligibleGroups = await groups.getAllGroupsWithMatchup();

    for (const group of eligibleGroups) {
      const lastSent = lastMatchupSent.get(group.id) ?? 0;
      const now = Date.now();

      if (now - lastSent < MATCHUP_INTERVAL_MS) continue;

      const candidates = await matchup.getMatchupCandidates(group.id);
      if (candidates.length === 0) {
        lastMatchupSent.set(group.id, now);
        continue;
      }

      // Pick randomly from top 3 closest-ELO candidates
      const top = candidates.slice(0, Math.min(3, candidates.length));
      const pick = top[Math.floor(Math.random() * top.length)];

      const lang = group.language ?? "en";
      const t = getT(lang);

      const llmMessage = await generateMatchupCommentary(
        {
          player1: { name: pick.player1_name, elo: pick.player1_elo },
          player2: { name: pick.player2_name, elo: pick.player2_elo },
          h2h: pick.h2h_total > 0
            ? { wins1: pick.h2h_p1_wins, wins2: pick.h2h_p2_wins, total: pick.h2h_total }
            : undefined,
        },
        lang,
      );

      let message: string;
      if (llmMessage) {
        message = llmMessage;
      } else {
        message = t("matchup.title") + "\n\n"
          + t("matchup.vs", { player1: pick.player1_name, player2: pick.player2_name }) + "\n"
          + t("matchup.elo", { elo1: pick.player1_elo, elo2: pick.player2_elo });
        if (pick.h2h_total > 0) {
          message += "\n" + t("matchup.h2h", {
            wins1: pick.h2h_p1_wins,
            wins2: pick.h2h_p2_wins,
            total: pick.h2h_total,
          });
        } else {
          message += "\n" + t("matchup.no_h2h");
        }
      }

      try {
        await bot.api.sendMessage(group.chat_id, message);
      } catch {
        // Group might have kicked the bot
      }

      lastMatchupSent.set(group.id, now);
    }
  } catch (err) {
    console.error("Matchup scheduler error:", err);
  }
}

async function checkEloDecay(): Promise<void> {
  try {
    const sql = getConnection();
    const groups = groupQueries(sql);

    const eligibleGroups = await groups.getAllGroupsWithDecay();

    for (const group of eligibleGroups) {
      const lastApplied = lastDecayApplied.get(group.id) ?? 0;
      const now = Date.now();

      if (now - lastApplied < DECAY_INTERVAL_MS) continue;

      const inactive = await groups.getInactiveMembers(group.id, DECAY_INACTIVE_DAYS);

      for (const member of inactive) {
        if (member.elo_rating <= DECAY_FLOOR) continue;
        const newElo = Math.max(DECAY_FLOOR, member.elo_rating - DECAY_PER_WEEK);
        await groups.setEloRating(group.id, member.player_id, newElo);
      }

      lastDecayApplied.set(group.id, now);
    }
  } catch (err) {
    console.error("ELO decay scheduler error:", err);
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
    checkAndSendMatchups(bot).catch((err) =>
      console.error("Matchup scheduler error:", err),
    );
    cleanupExpiredChallenges();
    cleanupExpiredConfirmations(bot).catch((err) =>
      console.error("Match confirmation cleanup error:", err),
    );
    checkEloDecay().catch((err) =>
      console.error("ELO decay scheduler error:", err),
    );
  }, DIGEST_INTERVAL_MS);
  console.log("Scheduler started.");
}
