import { describe, it, expect } from "vitest";
import { getSeasonForDate, isSeasonExpired } from "../seasons.js";

describe("getSeasonForDate", () => {
  // S1: Dec 1 – Feb 28/29

  it("returns S1 for December", () => {
    const result = getSeasonForDate(new Date("2025-12-15"));
    expect(result.name).toContain("S1");
    expect(result.name).toContain("2026");
    expect(result.startDate).toBe("2025-12-01");
    expect(result.endDate).toBe("2026-02-28");
  });

  it("returns S1 for January", () => {
    const result = getSeasonForDate(new Date("2026-01-15"));
    expect(result.name).toContain("S1");
    expect(result.name).toContain("2026");
    expect(result.startDate).toBe("2025-12-01");
    expect(result.endDate).toBe("2026-02-28");
  });

  it("returns S1 for February", () => {
    const result = getSeasonForDate(new Date("2026-02-10"));
    expect(result.name).toContain("S1");
  });

  // S2: Mar 1 – May 31

  it("returns S2 for March", () => {
    const result = getSeasonForDate(new Date("2026-03-01"));
    expect(result.name).toContain("S2");
    expect(result.startDate).toBe("2026-03-01");
    expect(result.endDate).toBe("2026-05-31");
  });

  it("returns S2 for May", () => {
    const result = getSeasonForDate(new Date("2026-05-31"));
    expect(result.name).toContain("S2");
  });

  // S3: Jun 1 – Aug 31

  it("returns S3 for June", () => {
    const result = getSeasonForDate(new Date("2026-06-15"));
    expect(result.name).toContain("S3");
    expect(result.startDate).toBe("2026-06-01");
    expect(result.endDate).toBe("2026-08-31");
  });

  // S4: Sep 1 – Nov 30

  it("returns S4 for September", () => {
    const result = getSeasonForDate(new Date("2026-09-01"));
    expect(result.name).toContain("S4");
    expect(result.startDate).toBe("2026-09-01");
    expect(result.endDate).toBe("2026-11-30");
  });

  it("returns S4 for November", () => {
    const result = getSeasonForDate(new Date("2026-11-30"));
    expect(result.name).toContain("S4");
  });

  it("handles leap year for S1", () => {
    const result = getSeasonForDate(new Date("2028-02-15"));
    expect(result.name).toContain("S1");
    expect(result.endDate).toBe("2028-02-29");
  });
});

describe("isSeasonExpired", () => {
  it("returns false when season is still active", () => {
    expect(isSeasonExpired("2026-02-28", new Date("2026-02-15"))).toBe(false);
  });

  it("returns false on the last day of the season", () => {
    expect(isSeasonExpired("2026-02-28", new Date("2026-02-28T12:00:00Z"))).toBe(false);
  });

  it("returns true after the season ends", () => {
    expect(isSeasonExpired("2026-02-28", new Date("2026-03-01T00:00:00Z"))).toBe(true);
  });
});
