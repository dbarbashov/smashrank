import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/activity", () => {
  let group: { id: string; slug: string };
  let alice: { id: string };
  let bob: { id: string };
  let season: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-activity" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, alice.id, { elo_rating: 1100, games_played: 2, wins: 1, losses: 1 });
    await addToGroup(group.id, bob.id, { elo_rating: 1050, games_played: 2, wins: 1, losses: 1 });
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  it("returns 404 for unknown slug", async () => {
    const res = await get("/api/g/nonexistent/activity");
    expect(res.status).toBe(404);
  });

  it("returns empty array when no matches", async () => {
    const res = await get("/api/g/test-activity/activity");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns activity data after matches", async () => {
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
    });
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: bob.id,
      loser_id: alice.id,
    });

    const res = await get("/api/g/test-activity/activity");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Should have at least one entry for today
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("date");
    expect(body[0]).toHaveProperty("count");
    expect(body[0].count).toBe(2);
  });

  it("filters by player", async () => {
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
    });

    const res = await get(`/api/g/test-activity/activity?player=${alice.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.length).toBeGreaterThan(0);
    expect(body[0].count).toBe(1);
  });

  it("respects days parameter", async () => {
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
    });

    const res = await get("/api/g/test-activity/activity?days=7");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.length).toBeGreaterThan(0);
  });
});
