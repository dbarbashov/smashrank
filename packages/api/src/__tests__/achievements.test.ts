import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import {
  cleanDb,
  createGroup,
  createPlayer,
  addToGroup,
  createSeason,
  createMatch,
  createTournament,
  getSql,
} from "./setup.js";

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
      expect(body).toHaveLength(70);
      expect(body[0].id).toBeDefined();
      expect(body[0].name).toBeDefined();
      expect(body[0].emoji).toBeDefined();
      expect(body[0].category).toBe("match");
      expect(body[0].kind).toBeDefined();
      expect(body[0].sort_order).toBeTypeOf("number");
      expect(body[0].holder_count).toBe(0);

      const categoryOrder = [
        "match", "rating", "opponents", "activity", "doubles", "tournaments", "shame", "meta",
      ];
      expect(body.map((item: { category: string }) => categoryOrder.indexOf(item.category)))
        .toEqual([...body]
          .map((item: { category: string }) => categoryOrder.indexOf(item.category))
          .sort((a: number, b: number) => a - b));
    });

    it("atomically ignores concurrent duplicate awards", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const sql = getSql();
      const awards = sql.json([{ player_id: alice.id, achievement_id: "first_blood" }]);

      const [first, second] = await Promise.all([
        sql`SELECT * FROM award_achievements(${group.id}::uuid, ${awards}::jsonb)`,
        sql`SELECT * FROM award_achievements(${group.id}::uuid, ${awards}::jsonb)`,
      ]);
      const stored = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM player_achievements
        WHERE group_id = ${group.id} AND player_id = ${alice.id} AND achievement_id = 'first_blood'
      `;

      expect(first.length + second.length).toBe(1);
      expect(stored[0].count).toBe(1);
    });

    it("does not award new hall-of-shame achievements before their release date", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const sql = getSql();
      const [{ eligible_from: eligibleFrom }] = await sql<{ eligible_from: Date }[]>`
        SELECT eligible_from FROM achievement_definitions WHERE id = 'abyss'
      `;
      const awards = sql.json([{ player_id: alice.id, achievement_id: "abyss" }]);

      const beforeRelease = await sql`
        SELECT * FROM award_achievements(
          ${group.id}::uuid, ${awards}::jsonb,
          NULL::text, NULL::uuid, NULL::jsonb,
          ${new Date(eligibleFrom.getTime() - 1)}
        )
      `;
      const afterRelease = await sql`
        SELECT * FROM award_achievements(
          ${group.id}::uuid, ${awards}::jsonb,
          NULL::text, NULL::uuid, NULL::jsonb,
          ${new Date(eligibleFrom.getTime() + 1)}
        )
      `;

      expect(eligibleFrom).toBeInstanceOf(Date);
      expect(beforeRelease).toHaveLength(0);
      expect(afterRelease).toHaveLength(1);
    });

    it("restarts exclusivity after a second holder is removed", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      const bob = await createPlayer({ display_name: "Bob" });
      await addToGroup(group.id, alice.id);
      await addToGroup(group.id, bob.id);
      const sql = getSql();
      await sql`
        INSERT INTO player_achievements (group_id, player_id, achievement_id, unlocked_at)
        VALUES
          (${group.id}, ${alice.id}, 'first_blood', NOW() - INTERVAL '40 days'),
          (${group.id}, ${bob.id}, 'first_blood', NOW() - INTERVAL '35 days')
      `;

      await sql`
        DELETE FROM player_achievements
        WHERE group_id = ${group.id} AND player_id = ${bob.id} AND achievement_id = 'first_blood'
      `;
      const state = await sql<{ sole_player_id: string; unique_since: Date }[]>`
        SELECT sole_player_id, unique_since FROM achievement_exclusivity
        WHERE group_id = ${group.id} AND achievement_id = 'first_blood'
      `;

      expect(state[0].sole_player_id).toBe(alice.id);
      expect(state[0].unique_since.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it("counts holders independently in each group", async () => {
      const otherGroup = await createGroup({ slug: "other-ach" });
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      await addToGroup(otherGroup.id, alice.id);
      const sql = getSql();

      await sql`
        INSERT INTO player_achievements (group_id, player_id, achievement_id)
        VALUES
          (${group.id}, ${alice.id}, 'first_blood'),
          (${otherGroup.id}, ${alice.id}, 'first_blood')
      `;

      const [firstResponse, secondResponse] = await Promise.all([
        get("/api/g/test-ach/achievements"),
        get("/api/g/other-ach/achievements"),
      ]);
      const first = await firstResponse.json();
      const second = await secondResponse.json();

      expect(first.find((item: { id: string }) => item.id === "first_blood").holder_count).toBe(1);
      expect(second.find((item: { id: string }) => item.id === "first_blood").holder_count).toBe(1);

      await expect(sql`
        INSERT INTO player_achievements (group_id, player_id, achievement_id)
        VALUES (${group.id}, ${alice.id}, 'first_blood')
      `).rejects.toThrow();
    });

    it("rejects cross-group and ambiguous achievement sources", async () => {
      const otherGroup = await createGroup({ slug: "other-source" });
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      await addToGroup(otherGroup.id, alice.id);

      const otherSeason = await createSeason({
        group_id: otherGroup.id,
        name: "Other season",
      });
      const localSeason = await createSeason({
        group_id: group.id,
        name: "Local season",
      });
      const localTournament = await createTournament({
        group_id: group.id,
        name: "Local tournament",
        created_by: alice.id,
      });
      const sql = getSql();

      await expect(sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, season_id)
        VALUES (${group.id}, ${alice.id}, 'party_worker', ${otherSeason.id})
      `).rejects.toThrow();

      await expect(sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, tournament_id, season_id)
        VALUES (
          ${group.id},
          ${alice.id},
          'tournament_champion',
          ${localTournament.id},
          ${localSeason.id}
        )
      `).rejects.toThrow();
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
        INSERT INTO player_achievements (group_id, player_id, achievement_id, match_id)
        VALUES (${group.id}, ${alice.id}, ${defs[0].id}, ${match.id})
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

    it("includes tournament and season achievements", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const season = await createSeason({ group_id: group.id, name: "Summer 2026" });
      const tournament = await createTournament({
        group_id: group.id,
        name: "Office Cup",
        created_by: alice.id,
      });
      const sql = getSql();

      await sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, tournament_id)
        VALUES (${group.id}, ${alice.id}, 'tournament_champion', ${tournament.id})
      `;
      await sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, season_id)
        VALUES (${group.id}, ${alice.id}, 'party_worker', ${season.id})
      `;

      const res = await get("/api/g/test-ach/achievements/recent");
      const body = await res.json();
      expect(body.map((item: { achievement_id: string }) => item.achievement_id)).toEqual(
        expect.arrayContaining(["tournament_champion", "party_worker"]),
      );
    });
  });

  describe("GET /api/g/:slug/achievements/:achievementId", () => {
    it("returns holders newest first with match context and an all-member denominator", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      const bob = await createPlayer({ display_name: "Bob" });
      await addToGroup(group.id, alice.id);
      await addToGroup(group.id, bob.id);
      const season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
      const match = await createMatch({
        group_id: group.id,
        season_id: season.id,
        winner_id: alice.id,
        loser_id: bob.id,
        winner_score: 2,
        loser_score: 1,
      });
      const sql = getSql();
      await sql`UPDATE group_members SET opted_out = true WHERE group_id = ${group.id} AND player_id = ${bob.id}`;
      await sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, match_id, unlocked_at)
        VALUES
          (${group.id}, ${alice.id}, 'first_blood', ${match.id}, NOW() - INTERVAL '1 day'),
          (${group.id}, ${bob.id}, 'first_blood', ${match.id}, NOW())
      `;

      const res = await get("/api/g/test-ach/achievements/first_blood");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.holder_count).toBe(2);
      expect(body.total_players).toBe(2);
      expect(body.holders.map((holder: { display_name: string }) => holder.display_name)).toEqual([
        "Bob",
        "Alice",
      ]);
      expect(body.holders[0].source).toMatchObject({
        type: "match",
        opponent_id: alice.id,
        opponent_name: "Alice",
        player_score: 1,
        opponent_score: 2,
      });
    });

    it("returns tournament, season, and missing-source contexts", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const season = await createSeason({ group_id: group.id, name: "Summer 2026" });
      const tournament = await createTournament({
        group_id: group.id,
        name: "Office Cup",
        created_by: alice.id,
      });
      const sql = getSql();
      await sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, tournament_id)
        VALUES (${group.id}, ${alice.id}, 'tournament_champion', ${tournament.id})
      `;
      await sql`
        INSERT INTO player_achievements
          (group_id, player_id, achievement_id, season_id)
        VALUES (${group.id}, ${alice.id}, 'party_worker', ${season.id})
      `;
      await sql`
        INSERT INTO player_achievements (group_id, player_id, achievement_id)
        VALUES (${group.id}, ${alice.id}, 'first_blood')
      `;

      const [tournamentResponse, seasonResponse, legacyResponse] = await Promise.all([
        get("/api/g/test-ach/achievements/tournament_champion"),
        get("/api/g/test-ach/achievements/party_worker"),
        get("/api/g/test-ach/achievements/first_blood"),
      ]);
      const [tournamentBody, seasonBody, legacyBody] = await Promise.all([
        tournamentResponse.json(),
        seasonResponse.json(),
        legacyResponse.json(),
      ]);

      expect(tournamentBody.holders[0].source).toEqual({
        type: "tournament",
        id: tournament.id,
        name: "Office Cup",
      });
      expect(seasonBody.holders[0].source).toEqual({
        type: "season",
        id: season.id,
        name: "Summer 2026",
      });
      expect(legacyBody.holders[0].source).toBeNull();
    });

    it("returns meta trigger context", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const sql = getSql();
      const context = sql.json({
        category: "match",
        trigger_achievement_ids: ["perfect_game", "glass_cannon"],
      });
      await sql`
        INSERT INTO player_achievements (
          group_id, player_id, achievement_id, source_type, meta_context
        ) VALUES (
          ${group.id}, ${alice.id}, 'jackpot', 'meta',
          ${context}::jsonb
        )
      `;

      const res = await get("/api/g/test-ach/achievements/jackpot");
      const body = await res.json();
      expect(body.holders[0].source).toEqual({
        type: "meta",
        category: "match",
        trigger_achievement_ids: ["perfect_game", "glass_cannon"],
      });
    });

    it("excludes ambiguous unscoped legacy rows", async () => {
      const alice = await createPlayer({ display_name: "Alice" });
      await addToGroup(group.id, alice.id);
      const sql = getSql();
      await sql`
        INSERT INTO player_achievements (player_id, achievement_id)
        VALUES (${alice.id}, 'first_blood')
      `;

      const res = await get("/api/g/test-ach/achievements/first_blood");
      const body = await res.json();
      expect(body.holder_count).toBe(0);
      expect(body.holders).toEqual([]);
    });

    it("returns 404 for an unknown achievement", async () => {
      const res = await get("/api/g/test-ach/achievements/not-real");
      expect(res.status).toBe(404);
    });
  });
});
