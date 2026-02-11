import { describe, it, expect } from "vitest";
import { getTier, getTierChange } from "../tiers.js";

describe("getTier", () => {
  it("returns Diamond for 1500+", () => {
    expect(getTier(1500).id).toBe("diamond");
    expect(getTier(1800).id).toBe("diamond");
  });

  it("returns Platinum for 1300-1499", () => {
    expect(getTier(1300).id).toBe("platinum");
    expect(getTier(1499).id).toBe("platinum");
  });

  it("returns Gold for 1100-1299", () => {
    expect(getTier(1100).id).toBe("gold");
    expect(getTier(1299).id).toBe("gold");
  });

  it("returns Silver for 900-1099", () => {
    expect(getTier(900).id).toBe("silver");
    expect(getTier(1099).id).toBe("silver");
  });

  it("returns Bronze for <900", () => {
    expect(getTier(899).id).toBe("bronze");
    expect(getTier(0).id).toBe("bronze");
    expect(getTier(100).id).toBe("bronze");
  });

  it("returns correct emoji for each tier", () => {
    expect(getTier(1500).emoji).toBe("\u{1F451}"); // crown
    expect(getTier(1300).emoji).toBe("\u{1F48E}"); // gem
    expect(getTier(1100).emoji).toBe("\u{1F947}"); // gold medal
    expect(getTier(900).emoji).toBe("\u{1F948}");  // silver medal
    expect(getTier(800).emoji).toBe("\u{1F949}");  // bronze medal
  });

  it("handles exact boundary values", () => {
    expect(getTier(1500).id).toBe("diamond");
    expect(getTier(1499).id).toBe("platinum");
    expect(getTier(1300).id).toBe("platinum");
    expect(getTier(1299).id).toBe("gold");
    expect(getTier(1100).id).toBe("gold");
    expect(getTier(1099).id).toBe("silver");
    expect(getTier(900).id).toBe("silver");
    expect(getTier(899).id).toBe("bronze");
  });
});

describe("getTierChange", () => {
  it("returns null when tier does not change", () => {
    expect(getTierChange(1200, 1250)).toBeNull();
    expect(getTierChange(950, 1050)).toBeNull();
    expect(getTierChange(1500, 1600)).toBeNull();
  });

  it("detects promotion", () => {
    const result = getTierChange(1099, 1100);
    expect(result).not.toBeNull();
    expect(result!.promoted).toBe(true);
    expect(result!.demoted).toBe(false);
    expect(result!.tier.id).toBe("gold");
  });

  it("detects demotion", () => {
    const result = getTierChange(1100, 1099);
    expect(result).not.toBeNull();
    expect(result!.promoted).toBe(false);
    expect(result!.demoted).toBe(true);
    expect(result!.tier.id).toBe("silver");
  });

  it("detects promotion across multiple tiers", () => {
    const result = getTierChange(800, 1500);
    expect(result).not.toBeNull();
    expect(result!.promoted).toBe(true);
    expect(result!.tier.id).toBe("diamond");
  });

  it("detects demotion across multiple tiers", () => {
    const result = getTierChange(1500, 800);
    expect(result).not.toBeNull();
    expect(result!.demoted).toBe(true);
    expect(result!.tier.id).toBe("bronze");
  });
});
