import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, getSql } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("seasons routes", () => {
  let group: { id: string; slug: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-seasons" });
  });

  describe("GET /api/g/:slug/seasons", () => {
    it("returns all seasons for group", async () => {
      await createSeason({ group_id: group.id, name: "Season 1" });
      await createSeason({ group_id: group.id, name: "Season 2" });

      const res = await get("/api/g/test-seasons/seasons");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });

    it("returns empty array when no seasons", async () => {
      const res = await get("/api/g/test-seasons/seasons");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  describe("GET /api/g/:slug/seasons/:id", () => {
    it("returns season detail with standings", async () => {
      const season = await createSeason({ group_id: group.id, name: "Season 1" });
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id, { elo_rating: 1200, games_played: 10, wins: 7, losses: 3 });

      const sql = getSql();
      await sql`
        INSERT INTO season_snapshots (season_id, player_id, final_elo, final_rank, games_played, wins, losses)
        VALUES (${season.id}, ${alice.id}, 1200, 1, 10, 7, 3)
      `;

      const res = await get(`/api/g/test-seasons/seasons/${season.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Season 1");
      expect(body.standings).toHaveLength(1);
      expect(body.standings[0].display_name).toBe("Alice");
      expect(body.standings[0].final_elo).toBe(1200);
    });

    it("returns 404 for unknown season", async () => {
      const res = await get("/api/g/test-seasons/seasons/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Season not found");
    });

    it("returns doubles standings for active season with ?type=doubles", async () => {
      const season = await createSeason({ group_id: group.id, name: "Active S", is_active: true });
      const alice = await createPlayer({ display_name: "Alice" });
      const bob = await createPlayer({ display_name: "Bob" });
      await addToGroup(group.id, alice.id, {
        elo_rating: 1100, games_played: 5, wins: 3, losses: 2,
        doubles_elo_rating: 1300, doubles_games_played: 4, doubles_wins: 3, doubles_losses: 1,
      });
      await addToGroup(group.id, bob.id, {
        elo_rating: 1200, games_played: 5, wins: 4, losses: 1,
        doubles_elo_rating: 1150, doubles_games_played: 4, doubles_wins: 1, doubles_losses: 3,
      });

      const res = await get(`/api/g/test-seasons/seasons/${season.id}?type=doubles`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Active S");
      expect(body.standings).toHaveLength(2);
      // Alice has higher doubles ELO
      expect(body.standings[0].final_elo).toBe(1300);
      expect(body.standings[0].display_name).toBe("Alice");
      expect(body.standings[0].wins).toBe(3);
      expect(body.standings[1].final_elo).toBe(1150);
      expect(body.standings[1].display_name).toBe("Bob");
    });

    it("returns doubles standings for ended season with ?type=doubles", async () => {
      const season = await createSeason({ group_id: group.id, name: "Ended S" });
      const alice = await createPlayer({ display_name: "Alice" });
      const bob = await createPlayer({ display_name: "Bob" });
      await addToGroup(group.id, alice.id);
      await addToGroup(group.id, bob.id);

      const sql = getSql();
      await sql`
        INSERT INTO season_snapshots (season_id, player_id, final_elo, final_rank, games_played, wins, losses,
          doubles_final_elo, doubles_final_rank, doubles_games_played, doubles_wins, doubles_losses)
        VALUES
          (${season.id}, ${alice.id}, 1200, 1, 10, 7, 3, 1350, 1, 6, 5, 1),
          (${season.id}, ${bob.id}, 1100, 2, 10, 5, 5, 1250, 2, 6, 3, 3)
      `;

      const res = await get(`/api/g/test-seasons/seasons/${season.id}?type=doubles`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.standings).toHaveLength(2);
      expect(body.standings[0].final_elo).toBe(1350);
      expect(body.standings[0].wins).toBe(5);
      expect(body.standings[0].final_rank).toBe(1);
      expect(body.standings[1].final_elo).toBe(1250);
      expect(body.standings[1].final_rank).toBe(2);
    });

    it("returns empty standings when no doubles games in season", async () => {
      const season = await createSeason({ group_id: group.id, name: "Singles Only" });
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);

      const sql = getSql();
      await sql`
        INSERT INTO season_snapshots (season_id, player_id, final_elo, final_rank, games_played, wins, losses,
          doubles_final_elo, doubles_games_played, doubles_wins, doubles_losses)
        VALUES (${season.id}, ${alice.id}, 1200, 1, 10, 7, 3, 1200, 0, 0, 0)
      `;

      const res = await get(`/api/g/test-seasons/seasons/${season.id}?type=doubles`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.standings).toHaveLength(0);
    });
  });
});
