import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/records", () => {
  let group: { id: string; slug: string };
  let alice: { id: string };
  let bob: { id: string };
  let season: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-records" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, alice.id, { elo_rating: 1100, games_played: 5, wins: 3, losses: 2, best_streak: 3 });
    await addToGroup(group.id, bob.id, { elo_rating: 1050, games_played: 5, wins: 2, losses: 3, best_streak: 2 });
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  it("returns 404 for unknown slug", async () => {
    const res = await get("/api/g/nonexistent/records");
    expect(res.status).toBe(404);
  });

  it("returns all-null records when no matches", async () => {
    const res = await get("/api/g/test-records/records");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.highestElo).toBeNull();
    expect(body.biggestUpset).toBeNull();
    expect(body.mostMatchesInDay).toBeNull();
    expect(body.highestEloGain).toBeNull();
    // longestStreak and mostGamesPlayed come from group_members, not matches
    expect(body.longestStreak).not.toBeNull();
    expect(body.longestStreak.playerName).toBe("Alice");
    expect(body.longestStreak.value).toBe(3);
    expect(body.mostGamesPlayed).not.toBeNull();
    expect(body.mostGamesPlayed.value).toBe(5);
  });

  it("returns correct records after matches", async () => {
    // Create a match: Alice beats Bob, big elo_change
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
      elo_before_winner: 1100,
      elo_before_loser: 1050,
      elo_change: 12,
    });

    // Create a second match: Bob beats Alice (upset: Alice has higher ELO)
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: bob.id,
      loser_id: alice.id,
      elo_before_winner: 1038,
      elo_before_loser: 1112,
      elo_change: 20,
    });

    const res = await get("/api/g/test-records/records");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Highest ELO: Alice reached 1112 (1100 + 12) from first match
    expect(body.highestElo).not.toBeNull();
    expect(body.highestElo.value).toBe(1112);
    expect(body.highestElo.playerName).toBe("Alice");

    // Highest ELO gain: 20 (Bob's upset)
    expect(body.highestEloGain).not.toBeNull();
    expect(body.highestEloGain.value).toBe(20);

    // Biggest upset: Bob beat Alice with 74 ELO gap
    expect(body.biggestUpset).not.toBeNull();
    expect(body.biggestUpset.playerName).toBe("Bob");
    expect(body.biggestUpset.value).toBe(74); // 1112 - 1038

    // Most matches in a day: both players played 2
    expect(body.mostMatchesInDay).not.toBeNull();
    expect(body.mostMatchesInDay.value).toBe(2);
  });

  it("response has correct shape", async () => {
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
    });

    const res = await get("/api/g/test-records/records");
    const body = await res.json();

    expect(body).toHaveProperty("highestElo");
    expect(body).toHaveProperty("longestStreak");
    expect(body).toHaveProperty("biggestUpset");
    expect(body).toHaveProperty("mostMatchesInDay");
    expect(body).toHaveProperty("highestEloGain");
    expect(body).toHaveProperty("mostGamesPlayed");

    // Check record entry shape
    if (body.highestElo) {
      expect(body.highestElo).toHaveProperty("playerId");
      expect(body.highestElo).toHaveProperty("playerName");
      expect(body.highestElo).toHaveProperty("value");
    }
  });

  it("excludes doubles matches from records", async () => {
    // Create a doubles match with very high ELO
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
      elo_before_winner: 2000,
      elo_before_loser: 1800,
      elo_change: 50,
      match_type: "doubles",
    });

    const res = await get("/api/g/test-records/records");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Doubles match should be excluded — no match-based records
    expect(body.highestElo).toBeNull();
    expect(body.highestEloGain).toBeNull();
    expect(body.biggestUpset).toBeNull();
    expect(body.mostMatchesInDay).toBeNull();
  });

  it("includes tournament matches in records", async () => {
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
      elo_before_winner: 1100,
      elo_before_loser: 1050,
      elo_change: 15,
      match_type: "tournament",
    });

    const res = await get("/api/g/test-records/records");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Tournament match should be included
    expect(body.highestElo).not.toBeNull();
    expect(body.highestElo.playerName).toBe("Alice");
    expect(body.highestEloGain).not.toBeNull();
    expect(body.highestEloGain.value).toBe(15);
  });

  it("biggest upset has correct detail string", async () => {
    // Bob (lower ELO) beats Alice (higher ELO)
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: bob.id,
      loser_id: alice.id,
      elo_before_winner: 900,
      elo_before_loser: 1200,
      elo_change: 25,
    });

    const res = await get("/api/g/test-records/records");
    const body = await res.json();

    expect(body.biggestUpset).not.toBeNull();
    expect(body.biggestUpset.playerName).toBe("Bob");
    expect(body.biggestUpset.value).toBe(300); // 1200 - 900
    expect(body.biggestUpset.detail).toBe("beat Alice");
  });
});
