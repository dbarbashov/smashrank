import { describe, it, expect } from "vitest";
import { evaluateAchievements, type AchievementContext } from "../achievements.js";

function baseContext(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    winnerId: "winner-1",
    loserId: "loser-1",
    winnerStreak: 1,
    winnerStreakBefore: 0,
    winnerElo: 1000,
    loserElo: 1000,
    winnerGamesPlayed: 20,
    loserGamesPlayed: 20,
    winnerWins: 10,
    setScores: null,
    matchesBetween: 1,
    winnerRank: 3,
    winnerExistingAchievements: [],
    loserExistingAchievements: [],
    loserStreak: -1,
    loserConsecutiveLossesVsWinner: 1,
    ...overrides,
  };
}

function ids(result: { achievementId: string; playerId: string }[]): string[] {
  return result.map((r) => r.achievementId).sort();
}

describe("evaluateAchievements", () => {
  it("returns empty for unremarkable match", () => {
    const result = evaluateAchievements(baseContext());
    expect(result).toEqual([]);
  });

  it("grants first_blood on first win", () => {
    const result = evaluateAchievements(baseContext({ winnerWins: 1, winnerGamesPlayed: 1 }));
    expect(ids(result)).toContain("first_blood");
  });

  it("grants on_fire at 5 streak", () => {
    const result = evaluateAchievements(baseContext({ winnerStreak: 5 }));
    expect(ids(result)).toContain("on_fire");
  });

  it("grants unstoppable at 10 streak (and on_fire)", () => {
    const result = evaluateAchievements(baseContext({ winnerStreak: 10 }));
    expect(ids(result)).toContain("unstoppable");
    expect(ids(result)).toContain("on_fire");
  });

  it("grants giant_killer when beating 200+ ELO higher opponent", () => {
    const result = evaluateAchievements(baseContext({ winnerElo: 800, loserElo: 1050 }));
    expect(ids(result)).toContain("giant_killer");
  });

  it("does not grant giant_killer at exactly 199 ELO gap", () => {
    const result = evaluateAchievements(baseContext({ winnerElo: 800, loserElo: 999 }));
    expect(ids(result)).not.toContain("giant_killer");
  });

  it("grants iron_man at 50 games", () => {
    const result = evaluateAchievements(baseContext({ winnerGamesPlayed: 50 }));
    expect(ids(result)).toContain("iron_man");
  });

  it("grants iron_man to loser at 50 games", () => {
    const result = evaluateAchievements(baseContext({ loserGamesPlayed: 50 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("iron_man");
  });

  it("grants centurion at 100 games", () => {
    const result = evaluateAchievements(baseContext({ winnerGamesPlayed: 100 }));
    expect(ids(result)).toContain("centurion");
    expect(ids(result)).toContain("iron_man");
  });

  it("grants comeback_kid when winning after 3+ loss streak", () => {
    const result = evaluateAchievements(baseContext({ winnerStreakBefore: -3, winnerStreak: 1 }));
    expect(ids(result)).toContain("comeback_kid");
  });

  it("does not grant comeback_kid for losing streak of -2", () => {
    const result = evaluateAchievements(baseContext({ winnerStreakBefore: -2, winnerStreak: 1 }));
    expect(ids(result)).not.toContain("comeback_kid");
  });

  it("grants top_dog at rank 1", () => {
    const result = evaluateAchievements(baseContext({ winnerRank: 1 }));
    expect(ids(result)).toContain("top_dog");
  });

  it("grants perfect_game on 11-0 set", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 11, l: 0 }, { w: 11, l: 5 }],
    }));
    expect(ids(result)).toContain("perfect_game");
  });

  it("does not grant perfect_game on 11-1", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 11, l: 1 }, { w: 11, l: 5 }],
    }));
    expect(ids(result)).not.toContain("perfect_game");
  });

  it("grants heartbreaker on 3-set comeback", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 9, l: 11 }, { w: 11, l: 7 }, { w: 11, l: 8 }],
    }));
    expect(ids(result)).toContain("heartbreaker");
  });

  it("does not grant heartbreaker when winning first set", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 11, l: 9 }, { w: 7, l: 11 }, { w: 11, l: 8 }],
    }));
    expect(ids(result)).not.toContain("heartbreaker");
  });

  it("does not grant heartbreaker on 2-set match", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 9, l: 11 }, { w: 11, l: 7 }],
    }));
    expect(ids(result)).not.toContain("heartbreaker");
  });

  it("grants rivalry at 10 matches between players", () => {
    const result = evaluateAchievements(baseContext({ matchesBetween: 10 }));
    expect(ids(result)).toContain("rivalry");
    // Both players get it
    expect(result.filter((r) => r.achievementId === "rivalry")).toHaveLength(2);
  });

  it("grants newcomer_threat with 5 wins in first 10 games", () => {
    const result = evaluateAchievements(baseContext({ winnerGamesPlayed: 10, winnerWins: 5 }));
    expect(ids(result)).toContain("newcomer_threat");
  });

  it("does not grant newcomer_threat after 10 games", () => {
    const result = evaluateAchievements(baseContext({ winnerGamesPlayed: 11, winnerWins: 6 }));
    expect(ids(result)).not.toContain("newcomer_threat");
  });

  it("skips already-earned achievements", () => {
    const result = evaluateAchievements(baseContext({
      winnerWins: 1,
      winnerGamesPlayed: 1,
      winnerExistingAchievements: ["first_blood"],
    }));
    expect(ids(result)).not.toContain("first_blood");
  });

  it("grants multiple achievements at once", () => {
    const result = evaluateAchievements(baseContext({
      winnerWins: 5,
      winnerGamesPlayed: 8,
      winnerStreak: 1,
      winnerStreakBefore: -4,
      winnerElo: 800,
      loserElo: 1050,
    }));
    expect(ids(result)).toContain("giant_killer");
    expect(ids(result)).toContain("comeback_kid");
    expect(ids(result)).toContain("newcomer_threat");
  });

  // --- Negative (shame) achievements ---

  it("grants free_fall at 5 loss streak", () => {
    const result = evaluateAchievements(baseContext({ loserStreak: -5 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("free_fall");
  });

  it("does not grant free_fall at -4 loss streak", () => {
    const result = evaluateAchievements(baseContext({ loserStreak: -4 }));
    expect(ids(result)).not.toContain("free_fall");
  });

  it("grants rock_bottom at 10 loss streak (and free_fall)", () => {
    const result = evaluateAchievements(baseContext({ loserStreak: -10 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    const loserIds = loserGrants.map((r) => r.achievementId);
    expect(loserIds).toContain("rock_bottom");
    expect(loserIds).toContain("free_fall");
  });

  it("does not grant rock_bottom at -9 loss streak", () => {
    const result = evaluateAchievements(baseContext({ loserStreak: -9 }));
    expect(ids(result)).not.toContain("rock_bottom");
  });

  it("grants punching_bag when loser is 200+ ELO above winner", () => {
    const result = evaluateAchievements(baseContext({ winnerElo: 800, loserElo: 1000 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("punching_bag");
  });

  it("does not grant punching_bag at 199 ELO gap", () => {
    const result = evaluateAchievements(baseContext({ winnerElo: 800, loserElo: 999 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("punching_bag");
  });

  it("grants humbled on 0-11 set loss", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 11, l: 0 }, { w: 11, l: 5 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("humbled");
  });

  it("does not grant humbled on 11-1", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 11, l: 1 }, { w: 11, l: 5 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("humbled");
  });

  it("grants bottled_it when loser won first set of 3-set match", () => {
    // setScores oriented from winner perspective: w < l means winner lost first set => loser won first set
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 9, l: 11 }, { w: 11, l: 7 }, { w: 11, l: 8 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("bottled_it");
  });

  it("does not grant bottled_it when loser lost first set", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 11, l: 9 }, { w: 7, l: 11 }, { w: 11, l: 8 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("bottled_it");
  });

  it("does not grant bottled_it on 2-set match", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 9, l: 11 }, { w: 11, l: 7 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("bottled_it");
  });

  it("grants glass_cannon when loser blanked winner in a set but lost match", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 0, l: 11 }, { w: 11, l: 5 }, { w: 11, l: 3 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("glass_cannon");
  });

  it("does not grant glass_cannon when loser scored in all sets", () => {
    const result = evaluateAchievements(baseContext({
      setScores: [{ w: 1, l: 11 }, { w: 11, l: 5 }, { w: 11, l: 3 }],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("glass_cannon");
  });

  it("grants doormat at 5 consecutive losses to same opponent", () => {
    const result = evaluateAchievements(baseContext({ loserConsecutiveLossesVsWinner: 5 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).toContain("doormat");
  });

  it("does not grant doormat at 4 consecutive losses", () => {
    const result = evaluateAchievements(baseContext({ loserConsecutiveLossesVsWinner: 4 }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("doormat");
  });

  it("skips already-earned negative achievements", () => {
    const result = evaluateAchievements(baseContext({
      loserStreak: -5,
      loserExistingAchievements: ["free_fall"],
    }));
    const loserGrants = result.filter((r) => r.playerId === "loser-1");
    expect(loserGrants.map((r) => r.achievementId)).not.toContain("free_fall");
  });
});
