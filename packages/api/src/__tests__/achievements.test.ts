import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch, getSql } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("achievements routes", () => {
  let group: { id: string; slug: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-ach" });
  });

  describe("GET /api/g/:slug/achievements", () => {
    it("returns all achievement definitions", async () => {
      const res = await get("/api/g/test-ach/achievements");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThan(0);
      expect(body[0].id).toBeDefined();
      expect(body[0].name).toBeDefined();
      expect(body[0].emoji).toBeDefined();
    });
  });

  describe("GET /api/g/:slug/achievements/recent", () => {
    it("returns recent achievements for group", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
      const bob = await createPlayer({ display_name: "Bob" });
      await addToGroup(group.id, bob.id);
      const match = await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });

      const sql = getSql();
      const defs = await sql<{ id: string }[]>`SELECT id FROM achievement_definitions LIMIT 1`;
      await sql`
        INSERT INTO player_achievements (player_id, achievement_id, match_id)
        VALUES (${alice.id}, ${defs[0].id}, ${match.id})
      `;

      const res = await get("/api/g/test-ach/achievements/recent");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].display_name).toBe("Alice");
      expect(body[0].name).toBeDefined();
    });

    it("returns empty array when no achievements", async () => {
      const res = await get("/api/g/test-ach/achievements/recent");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });
});
