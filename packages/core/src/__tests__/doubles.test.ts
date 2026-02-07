import { describe, it, expect } from "vitest";
import { calculateDoublesElo } from "../doubles.js";

describe("calculateDoublesElo", () => {
  it("calculates ELO changes for evenly matched teams", () => {
    const result = calculateDoublesElo({
      winner1Rating: 1000,
      winner2Rating: 1000,
      loser1Rating: 1000,
      loser2Rating: 1000,
      winner1GamesPlayed: 20,
      winner2GamesPlayed: 20,
      loser1GamesPlayed: 20,
      loser2GamesPlayed: 20,
    });

    expect(result.change).toBeGreaterThan(0);
    expect(result.winner1NewRating).toBeGreaterThan(1000);
    expect(result.winner2NewRating).toBeGreaterThan(1000);
    expect(result.loser1NewRating).toBeLessThan(1000);
    expect(result.loser2NewRating).toBeLessThan(1000);
  });

  it("applies same change to both partners", () => {
    const result = calculateDoublesElo({
      winner1Rating: 1100,
      winner2Rating: 900,
      loser1Rating: 1050,
      loser2Rating: 950,
      winner1GamesPlayed: 30,
      winner2GamesPlayed: 30,
      loser1GamesPlayed: 30,
      loser2GamesPlayed: 30,
    });

    const w1Change = result.winner1NewRating - 1100;
    const w2Change = result.winner2NewRating - 900;
    expect(w1Change).toBe(w2Change);
  });

  it("uses minimum K-factor of partners", () => {
    // One partner has many games (K=16), one has few (K=40)
    // Min should be K=16
    const result = calculateDoublesElo({
      winner1Rating: 1000,
      winner2Rating: 1000,
      loser1Rating: 1000,
      loser2Rating: 1000,
      winner1GamesPlayed: 5, // K=40
      winner2GamesPlayed: 50, // K=16
      loser1GamesPlayed: 20,
      loser2GamesPlayed: 20,
    });

    // With K=16 and equal ratings, change should be 8
    expect(result.change).toBe(8);
  });

  it("does not go below ELO floor", () => {
    const result = calculateDoublesElo({
      winner1Rating: 1500,
      winner2Rating: 1500,
      loser1Rating: 100,
      loser2Rating: 100,
      winner1GamesPlayed: 50,
      winner2GamesPlayed: 50,
      loser1GamesPlayed: 50,
      loser2GamesPlayed: 50,
    });

    expect(result.loser1NewRating).toBeGreaterThanOrEqual(100);
    expect(result.loser2NewRating).toBeGreaterThanOrEqual(100);
  });

  it("gives larger change for upset wins", () => {
    const normal = calculateDoublesElo({
      winner1Rating: 1200,
      winner2Rating: 1200,
      loser1Rating: 1000,
      loser2Rating: 1000,
      winner1GamesPlayed: 30,
      winner2GamesPlayed: 30,
      loser1GamesPlayed: 30,
      loser2GamesPlayed: 30,
    });

    const upset = calculateDoublesElo({
      winner1Rating: 1000,
      winner2Rating: 1000,
      loser1Rating: 1200,
      loser2Rating: 1200,
      winner1GamesPlayed: 30,
      winner2GamesPlayed: 30,
      loser1GamesPlayed: 30,
      loser2GamesPlayed: 30,
    });

    expect(upset.change).toBeGreaterThan(normal.change);
  });
});
