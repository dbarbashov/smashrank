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
  });
});
