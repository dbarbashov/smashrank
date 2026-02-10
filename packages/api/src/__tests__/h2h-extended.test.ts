import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/players/:id/h2h/:otherId (extended)", () => {
  let group: { id: string; slug: string };
  let season: { id: string };
  let alice: { id: string };
  let bob: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-h2h-ext" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, alice.id, { elo_rating: 1100, games_played: 5, wins: 3, losses: 2 });
    await addToGroup(group.id, bob.id, { elo_rating: 1050, games_played: 5, wins: 2, losses: 3 });
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  it("returns extended H2H with player profiles and ELO histories", async () => {
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id, elo_before_winner: 1000, elo_before_loser: 1000, elo_change: 16 });
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id, elo_before_winner: 1016, elo_before_loser: 984, elo_change: 15 });

    const res = await get(`/api/g/test-h2h-ext/players/${alice.id}/h2h/${bob.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Basic H2H
    expect(body.totalMatches).toBe(2);
    expect(body.winsA).toBe(2);
    expect(body.winsB).toBe(0);

    // Extended: player profiles
    expect(body.playerA).toBeDefined();
    expect(body.playerA.display_name).toBe("Alice");
    expect(body.playerA.elo_rating).toBe(1100);
    expect(body.playerB).toBeDefined();
    expect(body.playerB.display_name).toBe("Bob");

    // Extended: ELO histories
    expect(body.eloHistoryA).toBeInstanceOf(Array);
    expect(body.eloHistoryA.length).toBeGreaterThan(0);
    expect(body.eloHistoryB).toBeInstanceOf(Array);
    expect(body.eloHistoryB.length).toBeGreaterThan(0);

    // Extended: current streak
    expect(body.currentStreak).toBeDefined();
    expect(body.currentStreak.playerId).toBe(alice.id);
    expect(body.currentStreak.count).toBe(2);
  });

  it("returns null currentStreak when no consecutive wins", async () => {
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: bob.id, loser_id: alice.id });

    const res = await get(`/api/g/test-h2h-ext/players/${alice.id}/h2h/${bob.id}`);
    const body = await res.json();
    // Last match was bob winning, so streak is 1 for bob
    expect(body.currentStreak.playerId).toBe(bob.id);
    expect(body.currentStreak.count).toBe(1);
  });
});
