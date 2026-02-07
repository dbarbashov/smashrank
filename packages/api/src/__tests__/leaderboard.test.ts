import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch, getSql } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/leaderboard", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it("returns 404 for unknown slug", async () => {
    const res = await get("/api/g/nonexistent/leaderboard");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Group not found");
  });

  it("returns empty array when no players", async () => {
    const group = await createGroup({ slug: "test-lb" });
    const res = await get("/api/g/test-lb/leaderboard");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns players sorted by elo", async () => {
    const group = await createGroup({ slug: "test-lb2" });
    const p1 = await createPlayer({ display_name: "Alice", elo_rating: 1100, games_played: 5, wins: 3, losses: 2 });
    const p2 = await createPlayer({ display_name: "Bob", elo_rating: 1200, games_played: 5, wins: 4, losses: 1 });
    await addToGroup(group.id, p1.id);
    await addToGroup(group.id, p2.id);

    const res = await get("/api/g/test-lb2/leaderboard");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].display_name).toBe("Bob");
    expect(body[1].display_name).toBe("Alice");
    expect(body[0].id).toBeDefined();
    expect(body[0].best_streak).toBeDefined();
  });

  it("returns season snapshots when ?season=id", async () => {
    const group = await createGroup({ slug: "test-lb3" });
    const p1 = await createPlayer({ display_name: "Carol", elo_rating: 1300, games_played: 10, wins: 7, losses: 3 });
    await addToGroup(group.id, p1.id);

    const season = await createSeason({ group_id: group.id, name: "Season 1" });
    const sql = getSql();
    await sql`
      INSERT INTO season_snapshots (season_id, player_id, final_elo, final_rank, games_played, wins, losses)
      VALUES (${season.id}, ${p1.id}, 1300, 1, 10, 7, 3)
    `;

    const res = await get(`/api/g/test-lb3/leaderboard?season=${season.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].display_name).toBe("Carol");
    expect(body[0].final_elo).toBe(1300);
  });
});
