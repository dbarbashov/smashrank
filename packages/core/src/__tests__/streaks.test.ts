import { describe, it, expect } from "vitest";
import { updateStreak } from "../streaks.js";

describe("updateStreak", () => {
  it("starts a winning streak from 0", () => {
    const result = updateStreak(0, 0, true);
    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(1);
  });

  it("continues a winning streak", () => {
    const result = updateStreak(3, 3, true);
    expect(result.currentStreak).toBe(4);
    expect(result.bestStreak).toBe(4);
  });

  it("starts a losing streak from 0", () => {
    const result = updateStreak(0, 0, false);
    expect(result.currentStreak).toBe(-1);
    expect(result.bestStreak).toBe(0);
  });

  it("continues a losing streak", () => {
    const result = updateStreak(-2, 5, false);
    expect(result.currentStreak).toBe(-3);
    expect(result.bestStreak).toBe(5);
  });

  it("breaks a losing streak with a win", () => {
    const result = updateStreak(-4, 3, true);
    expect(result.currentStreak).toBe(1);
    expect(result.bestStreak).toBe(3);
  });

  it("breaks a winning streak with a loss", () => {
    const result = updateStreak(5, 5, false);
    expect(result.currentStreak).toBe(-1);
    expect(result.bestStreak).toBe(5);
  });

  it("updates best streak when current exceeds it", () => {
    const result = updateStreak(4, 4, true);
    expect(result.currentStreak).toBe(5);
    expect(result.bestStreak).toBe(5);
  });

  it("does not update best streak for losses", () => {
    const result = updateStreak(-1, 10, false);
    expect(result.currentStreak).toBe(-2);
    expect(result.bestStreak).toBe(10);
  });
});
