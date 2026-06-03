import { describe, it, expect } from "vitest";
import { getSeasonForDate, isSeasonExpired } from "../seasons.js";

describe("getSeasonForDate", () => {
  // S3: Sep 1 – Feb 28/29

  it("returns S3 for December", () => {
    const result = getSeasonForDate(new Date("2025-12-15"));
    expect(result.name).toBe("S3 2025 (Sep–Feb)");
    expect(result.startDate).toBe("2025-09-01");
    expect(result.endDate).toBe("2026-02-28");
  });

  it("returns S3 for January", () => {
    const result = getSeasonForDate(new Date("2026-01-15"));
    expect(result.name).toBe("S3 2025 (Sep–Feb)");
    expect(result.startDate).toBe("2025-09-01");
    expect(result.endDate).toBe("2026-02-28");
  });

  it("returns S3 for February", () => {
    const result = getSeasonForDate(new Date("2026-02-10"));
    expect(result.name).toBe("S3 2025 (Sep–Feb)");
  });

  // S2: Mar 1 – Aug 31

  it("returns S2 for March", () => {
    const result = getSeasonForDate(new Date("2026-03-01"));
    expect(result.name).toBe("S2 2026 (Mar–Aug)");
    expect(result.startDate).toBe("2026-03-01");
    expect(result.endDate).toBe("2026-08-31");
  });

  it("returns S2 for May", () => {
    const result = getSeasonForDate(new Date("2026-05-31"));
    expect(result.name).toBe("S2 2026 (Mar–Aug)");
  });

  it("returns S2 for June", () => {
    const result = getSeasonForDate(new Date("2026-06-15"));
    expect(result.name).toBe("S2 2026 (Mar–Aug)");
    expect(result.startDate).toBe("2026-03-01");
    expect(result.endDate).toBe("2026-08-31");
  });

  it("returns S2 for August", () => {
    const result = getSeasonForDate(new Date("2026-08-31"));
    expect(result.name).toBe("S2 2026 (Mar–Aug)");
    expect(result.endDate).toBe("2026-08-31");
  });

  // S3: Sep 1 – Feb 28/29

  it("returns S3 for September", () => {
    const result = getSeasonForDate(new Date("2026-09-01"));
    expect(result.name).toBe("S3 2026 (Sep–Feb)");
    expect(result.startDate).toBe("2026-09-01");
    expect(result.endDate).toBe("2027-02-28");
  });

  it("returns S3 for November", () => {
    const result = getSeasonForDate(new Date("2026-11-30"));
    expect(result.name).toBe("S3 2026 (Sep–Feb)");
  });

  it("handles leap year for S3", () => {
    const result = getSeasonForDate(new Date("2028-02-15"));
    expect(result.name).toBe("S3 2027 (Sep–Feb)");
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

  it("handles Date objects from postgres (not just strings)", () => {
    const endDate = new Date("2026-02-28T00:00:00.000Z");
    expect(isSeasonExpired(endDate, new Date("2026-02-28T12:00:00Z"))).toBe(false);
    expect(isSeasonExpired(endDate, new Date("2026-03-01T00:00:00Z"))).toBe(true);
  });
});
