import { describe, expect, it } from "vitest";
import type {
  LeaderboardEntry,
  Match,
  RecentAchievement,
  WeeklyStats,
} from "../types.js";
import {
  BROADCAST_EVENT_MAX_AGE_MS,
  buildBroadcastEvents,
} from "./league-broadcast-events.js";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");

function player(
  id: string,
  displayName: string,
  elo: number,
  streak: number,
): LeaderboardEntry {
  return {
    id,
    display_name: displayName,
    elo_rating: elo,
    games_played: 20,
    wins: 12,
    losses: 8,
    current_streak: streak,
    best_streak: streak,
    sets_played: 50,
  };
}

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    match_type: "singles",
    winner_id: "winner",
    loser_id: "loser",
    winner_score: 3,
    loser_score: 1,
    set_scores: null,
    winner_partner_id: null,
    loser_partner_id: null,
    elo_before_winner: 1100,
    elo_before_loser: 1250,
    elo_change: 24,
    played_at: new Date(NOW - 1_000).toISOString(),
    winner_name: "Winner",
    loser_name: "Loser",
    ...overrides,
  };
}

function achievement(overrides: Partial<RecentAchievement> = {}): RecentAchievement {
  return {
    id: "achievement-1",
    player_id: "player-1",
    achievement_id: "first_blood",
    unlocked_at: new Date(NOW - 2_000).toISOString(),
    display_name: "Player",
    name: "First Blood",
    description: "Win once",
    emoji: "💎",
    ...overrides,
  };
}

const weeklyStats: WeeklyStats = {
  matchCount: 2,
  mostActive: null,
  biggestGainer: { playerId: "gainer-id", name: "Same Name", change: 42 },
  biggestLoser: null,
  longestStreak: null,
  newAchievements: [],
};

describe("buildBroadcastEvents", () => {
  it("expires transient events against the supplied clock", () => {
    const expiredAt = new Date(NOW - BROADCAST_EVENT_MAX_AGE_MS - 1).toISOString();

    const events = buildBroadcastEvents({
      slug: "demo",
      leaderboard: [],
      matches: [match({ played_at: expiredAt })],
      achievements: [achievement({ unlocked_at: expiredAt })],
      now: NOW,
    });

    expect(events).toEqual([]);
  });

  it("rejects future timestamps instead of keeping them indefinitely", () => {
    const future = new Date(NOW + 1).toISOString();

    const events = buildBroadcastEvents({
      slug: "demo",
      leaderboard: [],
      matches: [match({ played_at: future })],
      achievements: [achievement({ unlocked_at: future })],
      now: NOW,
    });

    expect(events).toEqual([]);
  });

  it("uses explicit priority, keeps one story per match, and picks the strongest streak", () => {
    const events = buildBroadcastEvents({
      slug: "demo",
      leaderboard: [
        player("leader", "Leader", 1500, 3),
        player("challenger", "Challenger", 1450, 8),
      ],
      matches: [match()],
      achievements: [achievement()],
      weeklyStats,
      now: NOW,
    });

    expect(events.map((event) => event.kind)).toEqual([
      "upset",
      "achievement",
      "streak",
      "gainer",
      "chase",
    ]);
    expect(events.filter((event) => event.id === "match-match-1")).toHaveLength(1);
    expect(events.find((event) => event.kind === "streak")).toMatchObject({
      player: "Challenger",
      count: 8,
    });
  });

  it("builds the gainer link from the canonical player id", () => {
    const events = buildBroadcastEvents({
      slug: "demo",
      leaderboard: [
        player("wrong-id", "Same Name", 1500, 0),
        player("other-id", "Other", 1400, 0),
      ],
      weeklyStats,
      now: NOW,
    });

    expect(events.find((event) => event.kind === "gainer")).toMatchObject({
      to: "/g/demo/player/gainer-id",
    });
  });
});
