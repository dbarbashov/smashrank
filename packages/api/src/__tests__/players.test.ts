import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("players routes", () => {
  let group: { id: string; slug: string };
  let season: { id: string };
  let alice: { id: string };
  let bob: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-players" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    await addToGroup(group.id, alice.id, { elo_rating: 1100, games_played: 5, wins: 3, losses: 2 });
    await addToGroup(group.id, bob.id, { elo_rating: 1050, games_played: 5, wins: 2, losses: 3 });
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  describe("GET /api/g/:slug/players/:id", () => {
    it("returns player profile with stats", async () => {
      const res = await get(`/api/g/test-players/players/${alice.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.display_name).toBe("Alice");
      expect(Number(body.rank)).toBe(1);
      expect(body.achievement_count).toBe(0);
    });

    it("returns 404 for unknown player", async () => {
      const res = await get(`/api/g/test-players/players/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Player not found");
    });
  });

  describe("GET /api/g/:slug/players/:id/elo-history", () => {
    it("returns elo history from matches", async () => {
      await createMatch({
        group_id: group.id,
        season_id: season.id,
        winner_id: alice.id,
        loser_id: bob.id,
        elo_before_winner: 1000,
        elo_before_loser: 1000,
        elo_change: 16,
      });

      const res = await get(`/api/g/test-players/players/${alice.id}/elo-history`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].elo_after).toBe(1016);
      expect(body[0].match_id).toBeDefined();
    });
  });

  describe("GET /api/g/:slug/players/:id/matches", () => {
    it("returns paginated player matches", async () => {
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: bob.id, loser_id: alice.id });

      const res = await get(`/api/g/test-players/players/${alice.id}/matches?limit=1`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);

      const res2 = await get(`/api/g/test-players/players/${alice.id}/matches?limit=1&offset=1`);
      const body2 = await res2.json();
      expect(body2).toHaveLength(1);
      expect(body2[0].id).not.toBe(body[0].id);
    });
  });

  describe("GET /api/g/:slug/players/:id/h2h/:otherId", () => {
    it("returns head-to-head stats", async () => {
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
      await createMatch({ group_id: group.id, season_id: season.id, winner_id: bob.id, loser_id: alice.id });

      const res = await get(`/api/g/test-players/players/${alice.id}/h2h/${bob.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.totalMatches).toBe(3);
      expect(body.winsA).toBe(2);
      expect(body.winsB).toBe(1);
      expect(body.recent).toHaveLength(3);
    });
  });
});
