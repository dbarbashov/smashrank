import { describe, it, expect } from "vitest";
import { parseGameCommand } from "../score-parser.js";

describe("parseGameCommand", () => {
  describe("detailed set scores", () => {
    it("parses space-separated set scores", () => {
      const result = parseGameCommand("/game @bob 11-7 11-5");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.opponentUsername).toBe("bob");
      expect(result.data.winner).toBe("reporter");
      expect(result.data.winnerSets).toBe(2);
      expect(result.data.loserSets).toBe(0);
      expect(result.data.setScores).toEqual([
        { reporterScore: 11, opponentScore: 7 },
        { reporterScore: 11, opponentScore: 5 },
      ]);
    });

    it("parses comma-separated set scores", () => {
      const result = parseGameCommand("/game @bob 11-7, 11-5");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.setScores).toEqual([
        { reporterScore: 11, opponentScore: 7 },
        { reporterScore: 11, opponentScore: 5 },
      ]);
    });

    it("detects opponent win from set scores", () => {
      const result = parseGameCommand("/game @bob 7-11 5-11");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.winner).toBe("opponent");
      expect(result.data.winnerSets).toBe(2);
      expect(result.data.loserSets).toBe(0);
    });

    it("handles 3-set match", () => {
      const result = parseGameCommand("/game @bob 11-7 9-11 11-8");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.winner).toBe("reporter");
      expect(result.data.winnerSets).toBe(2);
      expect(result.data.loserSets).toBe(1);
    });

    it("validates deuce scores (12-10 OK)", () => {
      const result = parseGameCommand("/game @bob 12-10 11-5");
      expect(result.ok).toBe(true);
    });

    it("rejects invalid deuce (12-9)", () => {
      const result = parseGameCommand("/game @bob 12-9 11-5");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("invalid_set_score");
    });

    it("rejects score below 11", () => {
      const result = parseGameCommand("/game @bob 10-7 11-5");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("invalid_set_score");
    });

    it("validates extended deuce (14-12 OK)", () => {
      const result = parseGameCommand("/game @bob 14-12 11-5");
      expect(result.ok).toBe(true);
    });
  });

  describe("set count only", () => {
    it("parses 2-0 set count", () => {
      const result = parseGameCommand("/game @bob 2-0");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.winner).toBe("reporter");
      expect(result.data.winnerSets).toBe(2);
      expect(result.data.loserSets).toBe(0);
      expect(result.data.setScores).toBeNull();
    });

    it("parses 1-2 set count (opponent wins)", () => {
      const result = parseGameCommand("/game @bob 1-2");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.winner).toBe("opponent");
    });

    it("rejects equal set count", () => {
      const result = parseGameCommand("/game @bob 1-1");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("invalid_score_format");
    });
  });

  describe("won X-Y format", () => {
    it("parses 'won 2-1'", () => {
      const result = parseGameCommand("/game @bob won 2-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.winner).toBe("reporter");
      expect(result.data.winnerSets).toBe(2);
      expect(result.data.loserSets).toBe(1);
      expect(result.data.setScores).toBeNull();
    });

    it("rejects 'won 1-2' (contradictory)", () => {
      const result = parseGameCommand("/game @bob won 1-2");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("invalid_score_format");
    });
  });

  describe("error cases", () => {
    it("returns error when no opponent", () => {
      const result = parseGameCommand("/game 11-7 11-5");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("no_opponent");
    });

    it("returns error when no scores", () => {
      const result = parseGameCommand("/game @bob");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("no_scores");
    });

    it("rejects self-play", () => {
      const result = parseGameCommand("/game @alice 11-7 11-5", "alice");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("self_play");
    });

    it("self-play check is case-insensitive", () => {
      const result = parseGameCommand("/game @Alice 11-7 11-5", "alice");
      expect(result.ok).toBe(false);
    });
  });

  describe("without /game prefix", () => {
    it("parses raw text", () => {
      const result = parseGameCommand("@bob 11-7 11-5");
      expect(result.ok).toBe(true);
    });
  });
});
