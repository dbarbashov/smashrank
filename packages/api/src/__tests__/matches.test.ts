import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("matches routes", () => {
  let group: { id: string; slug: string };
  let season: { id: string };
  let alice: { id: string };
  let bob: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-matches" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, alice.id);
    await addToGroup(group.id, bob.id);
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  describe("GET /api/g/:slug/matches", () => {
    it("returns paginated match list", async () => {
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: bob.id, loser_id: alice.id });

      const res = await get("/api/g/test-matches/matches?limit=1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].winner_name).toBeDefined();
      expect(body[0].loser_name).toBeDefined();
    });

    it("filters by match type", async () => {
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id, match_type: "singles" });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id, match_type: "doubles" });

      const res = await get("/api/g/test-matches/matches?type=singles");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].match_type).toBe("singles");
    });

    it("filters by player", async () => {
      const carol = await createPlayer({ display_name: "Carol" });
      await addToGroup(group.id, carol.id);
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: carol.id, loser_id: bob.id });

      const res = await get(`/api/g/test-matches/matches?player=${carol.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  describe("GET /api/g/:slug/matches/:id", () => {
    it("returns a single match", async () => {
      const match = await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });

      const res = await get(`/api/g/test-matches/matches/${match.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(match.id);
      expect(body.winner_name).toBe("Alice");
      expect(body.loser_name).toBe("Bob");
    });

    it("returns 404 for unknown match", async () => {
      const res = await get("/api/g/test-matches/matches/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Match not found");
    });
  });
});
