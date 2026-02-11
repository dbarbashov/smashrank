import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/leaderboard/sparklines", () => {
  let group: { id: string; slug: string };
  let alice: { id: string };
  let bob: { id: string };
  let season: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-spark" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, alice.id, { elo_rating: 1100, games_played: 3, wins: 2, losses: 1 });
    await addToGroup(group.id, bob.id, { elo_rating: 1050, games_played: 3, wins: 1, losses: 2 });
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  it("returns 404 for unknown slug", async () => {
    const res = await get("/api/g/nonexistent/leaderboard/sparklines");
    expect(res.status).toBe(404);
  });

  it("returns empty object when no matches", async () => {
    const res = await get("/api/g/test-spark/leaderboard/sparklines");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns sparkline data after matches", async () => {
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
      elo_before_winner: 1000,
      elo_before_loser: 1000,
      elo_change: 16,
    });
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: bob.id,
      loser_id: alice.id,
      elo_before_winner: 984,
      elo_before_loser: 1016,
      elo_change: 18,
    });

    const res = await get("/api/g/test-spark/leaderboard/sparklines");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Both players should have 2 data points each (one per match)
    expect(body[alice.id]).toBeDefined();
    expect(body[bob.id]).toBeDefined();
    expect(body[alice.id].length).toBe(2);
    expect(body[bob.id].length).toBe(2);
    // Values should be numeric ELO ratings
    expect(typeof body[alice.id][0]).toBe("number");
    // Alice: won match 1 (1000+16=1016), lost match 2 (1016-18=998)
    expect(body[alice.id]).toEqual([1016, 998]);
    // Bob: lost match 1 (1000-16=984), won match 2 (984+18=1002)
    expect(body[bob.id]).toEqual([984, 1002]);
  });
});
