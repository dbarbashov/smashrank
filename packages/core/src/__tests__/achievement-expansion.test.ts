import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATALOG,
  achievementsInCategory,
  evaluateDoublesAchievements,
  evaluateExclusiveAchievements,
  evaluateLightsOutAchievements,
  evaluateMatchAchievements,
  evaluateMetaAchievements,
  evaluatePlayerHistoryAchievements,
  evaluateTournamentAchievements,
  type AchievementContext,
  type PlayerHistoryMatch,
} from "../index.js";

function match(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    matchType: "singles",
    winnerId: "w", loserId: "l", winnerStreak: 1, winnerStreakBefore: 0,
    winnerElo: 1000, loserElo: 1000, winnerGamesPlayed: 20, loserGamesPlayed: 20,
    winnerWins: 10, setScores: null, matchesBetween: 1, winnerRank: 3,
    winnerExistingAchievements: [], loserExistingAchievements: [], loserStreak: -1,
    loserConsecutiveLossesVsWinner: 1, ...overrides,
  };
}

const ids = (items: { achievementId: string }[]) => items.map((item) => item.achievementId);

const EXPANDED_SHAME_IDS = new Set([
  "abyss", "regular_customer", "shut_out", "demolition", "almost", "double_zero",
]);

describe("expanded achievement evaluators", () => {
  it("contains the 39 release achievements in the shared catalog", () => {
    expect(ACHIEVEMENT_CATALOG).toHaveLength(70);
    expect(new Set(ACHIEVEMENT_CATALOG.map((item) => item.id)).size).toBe(70);
  });

  it("orients perfect_game for a set won by the match loser", () => {
    const awards = evaluateMatchAchievements(match({ setScores: [
      { w: 0, l: 11 }, { w: 11, l: 4 }, { w: 11, l: 5 },
    ] }));
    expect(awards).toContainEqual({ achievementId: "perfect_game", playerId: "l" });
  });

  it("requires detailed scores for all score achievements", () => {
    expect(ids(evaluateMatchAchievements(match({ setScores: null })))).not.toEqual(expect.arrayContaining([
      "stolen_victory", "nerves_of_steel", "cardiologist_approved", "groundhog_day",
      "rollercoaster", "back_from_the_dead", "perfect_game",
    ]));
  });

  it("detects exact score scenarios and both-player awards", () => {
    const awards = evaluateMatchAchievements(match({ setScores: [
      { w: 11, l: 13 }, { w: 11, l: 13 }, { w: 13, l: 11 }, { w: 20, l: 18 },
    ] }));
    expect(ids(awards)).toEqual(expect.arrayContaining([
      "stolen_victory", "nerves_of_steel", "cardiologist_approved", "groundhog_day",
    ]));
    expect(awards.filter((item) => item.achievementId === "groundhog_day")).toHaveLength(2);
  });

  it("honours 199/200 ELO boundaries in doubles", () => {
    expect(ids(evaluateDoublesAchievements({
      winnerIds: ["a", "b"], loserIds: ["c", "d"],
      winnerElos: [1200, 1001], loserElos: [1200, 1200],
    }))).not.toContain("pack_hunt");
    const awards = evaluateDoublesAchievements({
      winnerIds: ["a", "b"], loserIds: ["c", "d"],
      winnerElos: [1200, 1000], loserElos: [1200, 1200],
    });
    expect(awards.filter((item) => item.achievementId === "pack_hunt")).toHaveLength(2);
    expect(awards).toContainEqual({ achievementId: "hard_carry", playerId: "a" });
  });

  it("does not grant expanded shame achievements for doubles", () => {
    const awards = evaluateDoublesAchievements({
      winnerIds: ["a", "b"], loserIds: ["c", "d"],
      winnerElos: [1200, 1200], loserElos: [1000, 1000],
    });
    expect(ids(awards).filter((id) => EXPANDED_SHAME_IDS.has(id))).toEqual([]);
  });

  it("uses the previous doubles partner for office_divorce", () => {
    const awards = evaluateDoublesAchievements({
      winnerIds: ["a", "b"], loserIds: ["c", "d"],
      winnerElos: [1000, 1000], loserElos: [1000, 1000],
      previousPartnerByPlayer: new Map([["a", "d"], ["b", "x"]]),
    });
    expect(awards).toContainEqual({ achievementId: "office_divorce", playerId: "a" });
    expect(awards).not.toContainEqual({ achievementId: "office_divorce", playerId: "b" });
  });

  it("treats tournament draws as H2H meetings that break winner streaks", () => {
    const interrupted = evaluateMatchAchievements(match({
      winnerId: "a", loserId: "b", matchesBetween: 5,
      recentH2HWinnerIds: ["a", "b", null, "a", "b"],
    }));
    expect(ids(interrupted)).not.toContain("boomerang");

    const balanced = evaluateMatchAchievements(match({
      winnerId: "a", loserId: "b", matchesBetween: 10,
      recentH2HWinnerIds: ["a", "b", "a", "b", null, null, "a", "b", "a", "b"],
    }));
    expect(ids(balanced)).toContain("perfect_balance");
  });

  it("limits broke_the_wall and throne_defender to singles matches", () => {
    const qualifying = {
      winnerConsecutiveLossesVsLoserBefore: 5,
      winnerTopTwoDefenceStreak: 3,
    };
    expect(ids(evaluateMatchAchievements(match(qualifying)))).toEqual(expect.arrayContaining([
      "broke_the_wall", "throne_defender",
    ]));
    expect(ids(evaluateMatchAchievements(match({
      ...qualifying,
      matchType: "tournament",
    })))).not.toEqual(expect.arrayContaining(["broke_the_wall", "throne_defender"]));
  });

  it("evaluates rating and challenge achievements at their exact boundaries", () => {
    expect(ids(evaluateMatchAchievements(match({ eloChange: 1 })))).toContain("small_but_nice");
    expect(ids(evaluateMatchAchievements(match({ eloChange: 3 })))).toContain("small_but_nice");
    expect(ids(evaluateMatchAchievements(match({ eloChange: 0 })))).not.toContain("small_but_nice");
    expect(ids(evaluateMatchAchievements(match({ eloChange: 4 })))).not.toContain("small_but_nice");

    const challenge = {
      challengeType: "challenge",
      challengeInitiatorId: "w",
      challengeTargetRank: 1,
    };
    expect(ids(evaluateMatchAchievements(match(challenge)))).toContain("bully");
    expect(ids(evaluateMatchAchievements(match({ ...challenge, challengeInitiatorId: "l" })))).not.toContain("bully");
    expect(ids(evaluateMatchAchievements(match({ ...challenge, challengeTargetRank: 2 })))).not.toContain("bully");

    expect(ids(evaluateMatchAchievements(match({
      winnerRankBefore: 2,
      loserRankBefore: 1,
      winnerRankAfter: 1,
    })))).toContain("throne_shaker");
    expect(ids(evaluateMatchAchievements(match({
      winnerRankBefore: 2,
      loserRankBefore: 1,
      winnerRankAfter: 2,
    })))).not.toContain("throne_shaker");
  });

  it("uses Moscow time for night_shift and early_bird boundaries", () => {
    expect(ids(evaluateMatchAchievements(match({ playedAt: "2026-01-01T21:00:00Z" })))).toContain("night_shift");
    expect(ids(evaluateMatchAchievements(match({ playedAt: "2026-01-02T00:59:00Z" })))).toContain("night_shift");
    expect(ids(evaluateMatchAchievements(match({ playedAt: "2026-01-02T01:00:00Z" })))).toContain("early_bird");
    expect(ids(evaluateMatchAchievements(match({ playedAt: "2026-01-02T06:59:00Z" })))).toContain("early_bird");
    expect(ids(evaluateMatchAchievements(match({ playedAt: "2026-01-02T07:00:00Z" })))).not.toEqual(
      expect.arrayContaining(["night_shift", "early_bird"]),
    );
  });

  it("evaluates Moscow-day streaks and a two-hour sliding window", () => {
    const matches = Array.from({ length: 5 }, (_, index) => ({
      playedAt: new Date(`2026-01-0${index + 1}T09:00:00Z`),
      matchType: "singles", won: index % 2 === 0, opponentIds: [`o${index}`],
    }));
    matches.push(...Array.from({ length: 5 }, (_, index) => ({
      playedAt: new Date(2026, 1, 1, 10, index * 20), matchType: "doubles", won: true,
      opponentIds: [`p${index}`, "x", "y"],
    })));
    const awards = evaluatePlayerHistoryAchievements({ playerId: "p", matches });
    expect(ids(awards)).toEqual(expect.arrayContaining(["no_day_without_ping_pong", "lunch_break", "social_butterfly"]));
  });

  it("detects alternating singles results only at eight", () => {
    const make = (count: number): PlayerHistoryMatch[] => Array.from({ length: count }, (_, index) => ({
      playedAt: new Date(2026, 0, index + 1), matchType: "singles", won: index % 2 === 0,
      opponentIds: ["o"],
    }));
    expect(ids(evaluatePlayerHistoryAchievements({ playerId: "p", matches: make(7) }))).not.toContain("stable_instability");
    expect(ids(evaluatePlayerHistoryAchievements({ playerId: "p", matches: make(8) }))).toContain("stable_instability");
    const interrupted = make(8);
    interrupted[4] = { ...interrupted[4], matchType: "tournament", draw: true };
    expect(ids(evaluatePlayerHistoryAchievements({ playerId: "p", matches: interrupted }))).not.toContain("stable_instability");
  });

  it("evaluates opponent coverage, daily variety, and robin_hood", () => {
    const sameMoscowDay: PlayerHistoryMatch[] = [
      { playedAt: "2026-02-10T08:00:00Z", matchType: "singles", won: true, opponentIds: ["a"], playerEloBefore: 1000, opponentEloBefore: 1200 },
      { playedAt: "2026-02-10T09:00:00Z", matchType: "tournament", won: false, opponentIds: ["b"], playerEloBefore: 1000, opponentEloBefore: 800 },
      { playedAt: "2026-02-10T10:00:00Z", matchType: "singles", won: true, opponentIds: ["c"] },
      { playedAt: "2026-02-10T11:00:00Z", matchType: "singles", won: true, opponentIds: ["d"] },
      { playedAt: "2026-02-10T12:00:00Z", matchType: "singles", won: true, opponentIds: ["e"] },
    ];
    const dailyAwards = ids(evaluatePlayerHistoryAchievements({ playerId: "p", matches: sameMoscowDay }));
    expect(dailyAwards).toEqual(expect.arrayContaining(["robin_hood", "diplomat"]));

    const coverage = sameMoscowDay.map((item) => ({ ...item, won: true }));
    const coverageAwards = ids(evaluatePlayerHistoryAchievements({
      playerId: "p",
      matches: coverage,
      activeOpponentIds: ["p", "a", "b", "c", "d", "e"],
    }));
    expect(coverageAwards).toEqual(expect.arrayContaining(["collector", "community_player"]));

    const missingOpponentAwards = ids(evaluatePlayerHistoryAchievements({
      playerId: "p",
      matches: coverage.slice(0, -1),
      activeOpponentIds: ["p", "a", "b", "c", "d", "e"],
    }));
    expect(missingOpponentAwards).not.toEqual(expect.arrayContaining(["collector", "community_player"]));
  });

  it("evaluates cumulative and consecutive doubles-partner achievements", () => {
    const doublesMatches: PlayerHistoryMatch[] = ["a", "a", "a", "a", "a", "b", "c", "d"].map(
      (partnerId, index) => ({
        playedAt: new Date(2026, 2, index + 1),
        matchType: "doubles",
        won: true,
        opponentIds: [partnerId, `o${index}`, `q${index}`],
      }),
    );
    const awards = ids(evaluatePlayerHistoryAchievements({
      playerId: "p",
      matches: doublesMatches,
      activeDoublesPlayerIds: ["p", "a", "b", "c", "d"],
    }));
    expect(awards).toEqual(expect.arrayContaining([
      "well_oiled_pair",
      "universal_soldier",
      "shuffle_lineups",
    ]));

    const repeatedLastPartner = doublesMatches.map((item, index) =>
      index === doublesMatches.length - 1 ? { ...item, opponentIds: ["c", "x", "y"] } : item
    );
    expect(ids(evaluatePlayerHistoryAchievements({
      playerId: "p",
      matches: repeatedLastPartner,
    }))).not.toContain("shuffle_lineups");
  });

  it("awards extended tournament outcomes", () => {
    const context = {
      participantIds: ["a", "b", "c", "d"],
      standings: new Map([
        ["a", { wins: 3, draws: 0, losses: 0 }], ["b", { wins: 2, draws: 0, losses: 1 }],
        ["c", { wins: 0, draws: 3, losses: 0 }], ["d", { wins: 0, draws: 0, losses: 3 }],
      ]),
      drawCounts: new Map([["c", 3]]), existingAchievements: new Map(),
      fixturesPlayed: new Map([["a", 3], ["b", 3], ["c", 3], ["d", 3]]),
      totalFixturesPerPlayer: 3, winnerId: "a", sortedPlayerIds: ["a", "b", "c", "d"],
      points: new Map([["a", 9], ["b", 9]]), beatenOpponentIds: new Map([["a", ["b", "c", "d"]]]),
      firstMatchResult: new Map<string, "win" | "draw" | "loss">([["a", "loss"]]),
    };
    expect(ids(evaluateTournamentAchievements(context))).toEqual(expect.arrayContaining([
      "clean_sweep", "quiet_start", "by_a_whisker", "wooden_spoon", "pacifist",
    ]));
  });

  it("cascades jackpot and hero_and_villain per player", () => {
    const awards = evaluateMetaAchievements({
      playerId: "p", primaryUnlockIds: ["perfect_game", "glass_cannon", "rivalry"],
      ownedAchievementIds: [],
    });
    expect(ids(awards)).toEqual(expect.arrayContaining(["jackpot", "hero_and_villain"]));
    expect(ids(evaluateMetaAchievements({
      playerId: "p", primaryUnlockIds: ["perfect_game", "glass_cannon", "rivalry"],
      ownedAchievementIds: [], eventIsMatch: false,
    }))).not.toEqual(expect.arrayContaining(["jackpot", "hero_and_villain"]));
  });

  it("unlocks full_collection only when a category becomes complete", () => {
    const categoryIds = achievementsInCategory("rating");
    const finalId = categoryIds.at(-1)!;
    const owned = categoryIds.slice(0, -1);
    expect(ids(evaluateMetaAchievements({
      playerId: "p",
      primaryUnlockIds: [finalId],
      ownedAchievementIds: owned,
      eventIsMatch: true,
    }))).toContain("full_collection");
    expect(ids(evaluateMetaAchievements({
      playerId: "p",
      primaryUnlockIds: [],
      ownedAchievementIds: owned,
      eventIsMatch: true,
    }))).not.toContain("full_collection");
  });

  it("matures exclusivity at exactly 30 days", () => {
    const now = new Date("2026-03-31T10:00:00Z");
    expect(evaluateExclusiveAchievements([{
      achievementId: "first_blood", solePlayerId: "p", uniqueSince: "2026-03-01T10:00:01Z",
    }], now)).toHaveLength(0);
    expect(ids(evaluateExclusiveAchievements([{
      achievementId: "first_blood", solePlayerId: "p", uniqueSince: "2026-03-01T10:00:00Z",
    }], now))).toContain("one_of_a_kind");
  });

  it("counts all four doubles participants for lights_out", () => {
    const days = Array.from({ length: 5 }, (_, index) => ({
      playedAt: new Date(2026, 0, index + 1), participantIds: ["a", "b", "c", "d"],
    }));
    expect(evaluateLightsOutAchievements(days)).toHaveLength(4);
  });
});
