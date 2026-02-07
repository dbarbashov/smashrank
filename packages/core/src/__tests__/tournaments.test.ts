import { describe, it, expect } from "vitest";
import { generateFixtures, sortStandings } from "../tournaments.js";
import type { Standing } from "../tournaments.js";
import { calculateDrawElo } from "../elo.js";
import { parseTournamentGameCommand } from "../score-parser.js";
import { evaluateTournamentAchievements } from "../achievements.js";

describe("calculateDrawElo", () => {
  it("returns no change for equal ratings", () => {
    const result = calculateDrawElo({
      playerARating: 1000,
      playerBRating: 1000,
      playerAGamesPlayed: 20,
      playerBGamesPlayed: 20,
    });
    expect(result.playerAChange).toBe(0);
    expect(result.playerBChange).toBe(0);
  });

  it("moves ratings closer together on draw", () => {
    const result = calculateDrawElo({
      playerARating: 1200,
      playerBRating: 1000,
      playerAGamesPlayed: 20,
      playerBGamesPlayed: 20,
    });
    // Higher-rated player should lose ELO on draw
    expect(result.playerAChange).toBeLessThan(0);
    // Lower-rated player should gain ELO on draw
    expect(result.playerBChange).toBeGreaterThan(0);
  });

  it("respects ELO floor", () => {
    const result = calculateDrawElo({
      playerARating: 100,
      playerBRating: 1500,
      playerAGamesPlayed: 50,
      playerBGamesPlayed: 50,
    });
    expect(result.playerANewRating).toBeGreaterThanOrEqual(100);
  });
});

describe("parseTournamentGameCommand", () => {
  it("parses a win with set scores", () => {
    const result = parseTournamentGameCommand("/tgame @bob 11-7 11-5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.opponentUsername).toBe("bob");
    expect(result.data.winner).toBe("reporter");
    expect(result.data.reporterSets).toBe(2);
    expect(result.data.opponentSets).toBe(0);
  });

  it("parses a loss with set scores", () => {
    const result = parseTournamentGameCommand("/tgame @bob 7-11 5-11");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.winner).toBe("opponent");
    expect(result.data.reporterSets).toBe(0);
    expect(result.data.opponentSets).toBe(2);
  });

  it("parses a 2-2 draw with set scores", () => {
    const result = parseTournamentGameCommand("/tgame @bob 11-7 7-11 11-8 8-11");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.winner).toBe("draw");
    expect(result.data.reporterSets).toBe(2);
    expect(result.data.opponentSets).toBe(2);
  });

  it("parses a draw with set count", () => {
    const result = parseTournamentGameCommand("/tgame @bob 2-2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.winner).toBe("draw");
    expect(result.data.reporterSets).toBe(2);
    expect(result.data.opponentSets).toBe(2);
  });

  it("rejects more than 4 sets", () => {
    const result = parseTournamentGameCommand("/tgame @bob 11-7 7-11 11-8 8-11 11-5");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("invalid_score_format");
  });

  it("rejects self-play", () => {
    const result = parseTournamentGameCommand("/tgame @alice 11-7", "alice");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("self_play");
  });

  it("rejects no opponent", () => {
    const result = parseTournamentGameCommand("/tgame 11-7 11-5");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("no_opponent");
  });

  it("parses win with set count 3-1", () => {
    const result = parseTournamentGameCommand("/tgame @bob 3-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.winner).toBe("reporter");
    expect(result.data.reporterSets).toBe(3);
    expect(result.data.opponentSets).toBe(1);
  });
});

describe("generateFixtures", () => {
  it("generates correct number of fixtures for 3 players", () => {
    const fixtures = generateFixtures(["a", "b", "c"]);
    expect(fixtures).toHaveLength(3);
  });

  it("generates correct number of fixtures for 4 players", () => {
    const fixtures = generateFixtures(["a", "b", "c", "d"]);
    expect(fixtures).toHaveLength(6);
  });

  it("generates correct number of fixtures for 12 players", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const fixtures = generateFixtures(ids);
    expect(fixtures).toHaveLength(66);
  });

  it("ensures every pair plays exactly once", () => {
    const fixtures = generateFixtures(["a", "b", "c"]);
    const pairs = fixtures.map((f) => [f.player1Id, f.player2Id].sort().join(":"));
    expect(new Set(pairs).size).toBe(3);
  });
});

describe("sortStandings", () => {
  it("sorts by points descending", () => {
    const standings: Standing[] = [
      { playerId: "a", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 2, setsLost: 2, eloRating: 1000 },
      { playerId: "b", points: 6, wins: 2, draws: 0, losses: 0, setsWon: 4, setsLost: 0, eloRating: 1000 },
      { playerId: "c", points: 0, wins: 0, draws: 0, losses: 2, setsWon: 0, setsLost: 4, eloRating: 1000 },
    ];
    const sorted = sortStandings(standings, new Map());
    expect(sorted[0].playerId).toBe("b");
    expect(sorted[1].playerId).toBe("a");
    expect(sorted[2].playerId).toBe("c");
  });

  it("breaks tie with H2H", () => {
    const standings: Standing[] = [
      { playerId: "a", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 2, setsLost: 2, eloRating: 1000 },
      { playerId: "b", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 2, setsLost: 2, eloRating: 1000 },
    ];
    const h2h = new Map<string, string | null>([["a:b", "b"]]);
    const sorted = sortStandings(standings, h2h);
    expect(sorted[0].playerId).toBe("b");
    expect(sorted[1].playerId).toBe("a");
  });

  it("breaks tie with set difference", () => {
    const standings: Standing[] = [
      { playerId: "a", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 2, setsLost: 3, eloRating: 1000 },
      { playerId: "b", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 3, setsLost: 2, eloRating: 1000 },
    ];
    const sorted = sortStandings(standings, new Map());
    expect(sorted[0].playerId).toBe("b");
  });

  it("breaks tie with ELO", () => {
    const standings: Standing[] = [
      { playerId: "a", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 2, setsLost: 2, eloRating: 1000 },
      { playerId: "b", points: 3, wins: 1, draws: 0, losses: 1, setsWon: 2, setsLost: 2, eloRating: 1100 },
    ];
    const sorted = sortStandings(standings, new Map());
    expect(sorted[0].playerId).toBe("b");
  });
});

describe("evaluateTournamentAchievements", () => {
  const baseCtx = {
    participantIds: ["a", "b", "c"],
    standings: new Map([
      ["a", { wins: 2, draws: 0, losses: 0 }],
      ["b", { wins: 1, draws: 0, losses: 1 }],
      ["c", { wins: 0, draws: 0, losses: 2 }],
    ]),
    drawCounts: new Map<string, number>(),
    existingAchievements: new Map<string, string[]>([
      ["a", []],
      ["b", []],
      ["c", []],
    ]),
    fixturesPlayed: new Map([["a", 2], ["b", 2], ["c", 2]]),
    totalFixturesPerPlayer: 2,
    winnerId: "a",
  };

  it("grants tournament_champion to winner", () => {
    const unlocks = evaluateTournamentAchievements(baseCtx);
    expect(unlocks.some((u) => u.achievementId === "tournament_champion" && u.playerId === "a")).toBe(true);
  });

  it("grants tournament_undefeated to players with no losses", () => {
    const unlocks = evaluateTournamentAchievements(baseCtx);
    expect(unlocks.some((u) => u.achievementId === "tournament_undefeated" && u.playerId === "a")).toBe(true);
    expect(unlocks.some((u) => u.achievementId === "tournament_undefeated" && u.playerId === "b")).toBe(false);
  });

  it("grants tournament_ironman to players who played all fixtures", () => {
    const unlocks = evaluateTournamentAchievements(baseCtx);
    expect(unlocks.filter((u) => u.achievementId === "tournament_ironman")).toHaveLength(3);
  });

  it("grants draw_master with 3+ draws", () => {
    const ctx = {
      ...baseCtx,
      participantIds: ["a", "b", "c", "d"],
      drawCounts: new Map([["a", 3], ["b", 1]]),
    };
    const unlocks = evaluateTournamentAchievements(ctx);
    expect(unlocks.some((u) => u.achievementId === "draw_master" && u.playerId === "a")).toBe(true);
    expect(unlocks.some((u) => u.achievementId === "draw_master" && u.playerId === "b")).toBe(false);
  });

  it("does not grant already-owned achievements", () => {
    const ctx = {
      ...baseCtx,
      existingAchievements: new Map([
        ["a", ["tournament_champion"]],
        ["b", []],
        ["c", []],
      ]),
    };
    const unlocks = evaluateTournamentAchievements(ctx);
    expect(unlocks.some((u) => u.achievementId === "tournament_champion" && u.playerId === "a")).toBe(false);
  });
});
