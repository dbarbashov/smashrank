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
    const p1 = await createPlayer({ display_name: "Alice" });
    const p2 = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, p1.id, { elo_rating: 1100, games_played: 5, wins: 3, losses: 2 });
    await addToGroup(group.id, p2.id, { elo_rating: 1200, games_played: 5, wins: 4, losses: 1 });

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
    const p1 = await createPlayer({ display_name: "Carol" });
    await addToGroup(group.id, p1.id, { elo_rating: 1300, games_played: 10, wins: 7, losses: 3 });

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

  it("returns doubles leaderboard with ?type=doubles", async () => {
    const group = await createGroup({ slug: "test-lb-dbl" });
    const p1 = await createPlayer({ display_name: "Alice" });
    const p2 = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, p1.id, {
      elo_rating: 1100, games_played: 5, wins: 3, losses: 2,
      doubles_elo_rating: 1300, doubles_games_played: 4, doubles_wins: 3, doubles_losses: 1,
    });
    await addToGroup(group.id, p2.id, {
      elo_rating: 1200, games_played: 5, wins: 4, losses: 1,
      doubles_elo_rating: 1150, doubles_games_played: 4, doubles_wins: 1, doubles_losses: 3,
    });

    const res = await get("/api/g/test-lb-dbl/leaderboard?type=doubles");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    // Alice has higher doubles ELO (1300 vs 1150)
    expect(body[0].display_name).toBe("Alice");
    expect(body[0].elo_rating).toBe(1300);
    expect(body[0].wins).toBe(3);
    expect(body[1].display_name).toBe("Bob");
    expect(body[1].elo_rating).toBe(1150);
  });

  it("returns doubles season snapshots with ?season=id&type=doubles", async () => {
    const group = await createGroup({ slug: "test-lb-dbl-s" });
    const p1 = await createPlayer({ display_name: "Alice" });
    const p2 = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, p1.id);
    await addToGroup(group.id, p2.id);

    const season = await createSeason({ group_id: group.id, name: "S1" });
    const sql = getSql();
    await sql`
      INSERT INTO season_snapshots (season_id, player_id, final_elo, final_rank, games_played, wins, losses,
        doubles_final_elo, doubles_final_rank, doubles_games_played, doubles_wins, doubles_losses)
      VALUES
        (${season.id}, ${p1.id}, 1200, 1, 10, 7, 3, 1350, 1, 6, 5, 1),
        (${season.id}, ${p2.id}, 1100, 2, 10, 5, 5, 1250, 2, 6, 3, 3)
    `;

    const res = await get(`/api/g/test-lb-dbl-s/leaderboard?season=${season.id}&type=doubles`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].final_elo).toBe(1350);
    expect(body[0].wins).toBe(5);
    expect(body[0].final_rank).toBe(1);
    expect(body[1].final_elo).toBe(1250);
    expect(body[1].final_rank).toBe(2);
  });
});
