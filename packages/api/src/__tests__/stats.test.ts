import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("stats routes", () => {
  let group: { id: string; slug: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-stats" });
  });

  describe("GET /api/g/:slug/stats/weekly", () => {
    it("returns weekly stats with zero matches", async () => {
      const res = await get("/api/g/test-stats/stats/weekly");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.matchCount).toBe(0);
      expect(body.mostActive).toBeNull();
    });

    it("returns weekly stats with matches", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      const bob = await createPlayer({ display_name: "Bob" });
      await addToGroup(group.id, alice.id);
      await addToGroup(group.id, bob.id);
      const season = await createSeason({ group_id: group.id, name: "S1", is_active: true });

      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });

      const res = await get("/api/g/test-stats/stats/weekly");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.matchCount).toBe(2);
      expect(body.mostActive).not.toBeNull();
    });
  });
});
