import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/players/:id/opponents", () => {
  let group: { id: string; slug: string };
  let season: { id: string };
  let alice: { id: string };
  let bob: { id: string };
  let charlie: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-opponents" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    charlie = await createPlayer({ display_name: "Charlie" });
    await addToGroup(group.id, alice.id);
    await addToGroup(group.id, bob.id);
    await addToGroup(group.id, charlie.id);
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  it("returns frequent opponents sorted by match count", async () => {
    // Alice vs Bob: 3 matches
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: bob.id, loser_id: alice.id });
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: bob.id });

    // Alice vs Charlie: 1 match
    await createMatch({ group_id: group.id, season_id: season.id, winner_id: alice.id, loser_id: charlie.id });

    const res = await get(`/api/g/test-opponents/players/${alice.id}/opponents`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].display_name).toBe("Bob");
    expect(body[0].match_count).toBe(3);
    expect(body[0].wins).toBe(2);
    expect(body[0].losses).toBe(1);
    expect(body[1].display_name).toBe("Charlie");
    expect(body[1].match_count).toBe(1);
  });

  it("returns empty array when no matches played", async () => {
    const res = await get(`/api/g/test-opponents/players/${alice.id}/opponents`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });
});
