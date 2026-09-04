import type { TFunction } from "i18next";
import type {
  LeaderboardEntry,
  Match,
  RecentAchievement,
  WeeklyStats,
} from "../types.js";

export const MAX_BROADCAST_EVENTS = 5;
export const BROADCAST_EVENT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type BroadcastEvent =
  | {
      id: string;
      kind: "upset";
      to: string;
      occurredAt: number;
      winner: string;
      loser: string;
      change: number;
    }
  | {
      id: string;
      kind: "achievement";
      to: string;
      occurredAt: number;
      player: string;
      achievementId: string;
      achievementName: string;
    }
  | {
      id: string;
      kind: "streak";
      to: string;
      occurredAt: null;
      player: string;
      count: number;
    }
  | {
      id: string;
      kind: "gainer";
      to: string;
      occurredAt: null;
      player: string;
      change: number;
    }
  | {
      id: string;
      kind: "match";
      to: string;
      occurredAt: number;
      winner: string;
      loser: string;
      winnerScore: number | null;
      loserScore: number | null;
      change: number;
    }
  | {
      id: string;
      kind: "chase";
      to: string;
      occurredAt: null;
      player: string;
      gap: number;
    };

interface BuildBroadcastEventsInput {
  slug: string;
  leaderboard: LeaderboardEntry[];
  matches?: Match[];
  achievements?: RecentAchievement[];
  weeklyStats?: WeeklyStats;
  now: number;
}

const PRIORITY: Record<BroadcastEvent["kind"], number> = {
  upset: 60,
  achievement: 50,
  streak: 40,
  gainer: 30,
  match: 20,
  chase: 10,
};

const UPSET_ELO_GAP = 100;

function recentTimestamp(timestamp: string, now: number): number | null {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value) || value > now) return null;
  return now - value <= BROADCAST_EVENT_MAX_AGE_MS ? value : null;
}

function firstRecent<T>(
  items: T[],
  getTimestamp: (item: T) => string,
  now: number,
): { item: T; occurredAt: number } | undefined {
  for (const item of items) {
    const occurredAt = recentTimestamp(getTimestamp(item), now);
    if (occurredAt !== null) return { item, occurredAt };
  }
}

function strongestStreak(leaderboard: LeaderboardEntry[]) {
  let strongest: LeaderboardEntry | undefined;

  for (const player of leaderboard) {
    if (
      player.current_streak >= 3
      && (!strongest || player.current_streak > strongest.current_streak)
    ) {
      strongest = player;
    }
  }

  return strongest;
}

function matchEvent(match: Match, slug: string, occurredAt: number): BroadcastEvent {
  if (match.elo_before_loser - match.elo_before_winner >= UPSET_ELO_GAP) {
    return {
      id: `match-${match.id}`,
      kind: "upset",
      to: `/g/${slug}/matches`,
      occurredAt,
      winner: match.winner_name,
      loser: match.loser_name,
      change: match.elo_change,
    };
  }

  return {
    id: `match-${match.id}`,
    kind: "match",
    to: `/g/${slug}/matches`,
    occurredAt,
    winner: match.winner_name,
    loser: match.loser_name,
    winnerScore: match.winner_score,
    loserScore: match.loser_score,
    change: match.elo_change,
  };
}

export function buildBroadcastEvents({
  slug,
  leaderboard,
  matches = [],
  achievements = [],
  weeklyStats,
  now,
}: BuildBroadcastEventsInput): BroadcastEvent[] {
  const events: BroadcastEvent[] = [];
  const latestMatch = firstRecent(matches, (match) => match.played_at, now);
  const latestAchievement = firstRecent(
    achievements,
    (achievement) => achievement.unlocked_at,
    now,
  );
  const streakLeader = strongestStreak(leaderboard);
  const leader = leaderboard[0];
  const challenger = leaderboard[1];

  if (latestMatch) {
    events.push(matchEvent(latestMatch.item, slug, latestMatch.occurredAt));
  }

  if (latestAchievement) {
    events.push({
      id: `achievement-${latestAchievement.item.id}`,
      kind: "achievement",
      to: `/g/${slug}/achievements`,
      occurredAt: latestAchievement.occurredAt,
      player: latestAchievement.item.display_name,
      achievementId: latestAchievement.item.achievement_id,
      achievementName: latestAchievement.item.name,
    });
  }

  if (streakLeader) {
    events.push({
      id: `streak-${streakLeader.id}`,
      kind: "streak",
      to: `/g/${slug}/player/${streakLeader.id}`,
      occurredAt: null,
      player: streakLeader.display_name,
      count: streakLeader.current_streak,
    });
  }

  if (weeklyStats?.biggestGainer && weeklyStats.biggestGainer.change > 0) {
    const gainer = weeklyStats.biggestGainer;
    events.push({
      id: `gainer-${gainer.playerId}`,
      kind: "gainer",
      to: `/g/${slug}/player/${gainer.playerId}`,
      occurredAt: null,
      player: gainer.name,
      change: gainer.change,
    });
  }

  if (leader && challenger) {
    events.push({
      id: `chase-${challenger.id}`,
      kind: "chase",
      to: `/g/${slug}/player/${challenger.id}`,
      occurredAt: null,
      player: challenger.display_name,
      gap: leader.elo_rating - challenger.elo_rating,
    });
  }

  return events
    .sort((left, right) =>
      PRIORITY[right.kind] - PRIORITY[left.kind]
      || (right.occurredAt ?? 0) - (left.occurredAt ?? 0),
    )
    .slice(0, MAX_BROADCAST_EVENTS);
}

export function formatBroadcastEvent(event: BroadcastEvent, t: TFunction): string {
  switch (event.kind) {
    case "upset":
      return t("broadcast.upset", event);
    case "achievement":
      return t("broadcast.achievement", {
        player: event.player,
        achievement: t(
          `achievementDefs.${event.achievementId}.name`,
          event.achievementName,
        ),
      });
    case "streak":
      return t("broadcast.streak", event);
    case "gainer":
      return t("broadcast.gainer", event);
    case "match": {
      const score = event.winnerScore == null || event.loserScore == null
        ? ""
        : ` · ${event.winnerScore}:${event.loserScore}`;
      return t("broadcast.match", { ...event, score });
    }
    case "chase":
      return t("broadcast.chase", event);
  }
}
