import { describe, it, expect } from "vitest";
import { getKFactor, expectedScore, calculateElo } from "../elo.js";

describe("getKFactor", () => {
  it("returns 40 for new players (<10 games)", () => {
    expect(getKFactor(0)).toBe(40);
    expect(getKFactor(5)).toBe(40);
    expect(getKFactor(9)).toBe(40);
  });

  it("returns 24 for intermediate players (10-30 games)", () => {
    expect(getKFactor(10)).toBe(24);
    expect(getKFactor(20)).toBe(24);
    expect(getKFactor(30)).toBe(24);
  });

  it("returns 16 for veteran players (>30 games)", () => {
    expect(getKFactor(31)).toBe(16);
    expect(getKFactor(100)).toBe(16);
  });
});

describe("expectedScore", () => {
  it("returns 0.5 for equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  it("returns higher value for higher-rated player", () => {
    const result = expectedScore(1200, 1000);
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeCloseTo(0.76, 1);
  });

  it("returns lower value for lower-rated player", () => {
    const result = expectedScore(1000, 1200);
    expect(result).toBeLessThan(0.5);
  });

  it("expected scores of both players sum to 1", () => {
    const eA = expectedScore(1200, 1000);
    const eB = expectedScore(1000, 1200);
    expect(eA + eB).toBeCloseTo(1.0);
  });
});

describe("calculateElo", () => {
  it("calculates correctly for equal-rated new players", () => {
    const result = calculateElo({
      winnerRating: 1000,
      loserRating: 1000,
      winnerGamesPlayed: 0,
      loserGamesPlayed: 0,
    });
    expect(result.winnerNewRating).toBe(1020);
    expect(result.loserNewRating).toBe(980);
    expect(result.change).toBe(20);
  });

  it("uses asymmetric K-factors", () => {
    const result = calculateElo({
      winnerRating: 1000,
      loserRating: 1000,
      winnerGamesPlayed: 5, // K=40
      loserGamesPlayed: 50, // K=16
    });
    // Winner gains more (K=40) than loser loses (K=16)
    expect(result.winnerNewRating).toBe(1020);
    expect(result.loserNewRating).toBe(992);
    expect(result.change).toBe(20);
  });

  it("handles upset (lower-rated player wins)", () => {
    const result = calculateElo({
      winnerRating: 800,
      loserRating: 1200,
      winnerGamesPlayed: 20,
      loserGamesPlayed: 20,
    });
    // Winner gains a lot, loser loses a lot
    expect(result.winnerNewRating).toBeGreaterThan(800);
    expect(result.loserNewRating).toBeLessThan(1200);
    expect(result.change).toBeGreaterThan(15);
  });

  it("enforces ELO floor at 100", () => {
    const result = calculateElo({
      winnerRating: 1500,
      loserRating: 100,
      winnerGamesPlayed: 50,
      loserGamesPlayed: 50,
    });
    expect(result.loserNewRating).toBe(100);
  });

  it("favored player wins smaller amount", () => {
    const result = calculateElo({
      winnerRating: 1300,
      loserRating: 1000,
      winnerGamesPlayed: 20,
      loserGamesPlayed: 20,
    });
    // Change should be small because winner was expected to win
    expect(result.change).toBeLessThan(12);
  });
});
