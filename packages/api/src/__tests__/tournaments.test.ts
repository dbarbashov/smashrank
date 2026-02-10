import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup, createSeason, createMatch, createTournament, addTournamentParticipant } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/tournaments", () => {
  let group: { id: string; slug: string };
  let alice: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-tourney" });
    alice = await createPlayer({ display_name: "Alice" });
    await addToGroup(group.id, alice.id);
  });

  it("returns empty array when no tournaments", async () => {
    const res = await get(`/api/g/test-tourney/tournaments`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("returns tournaments with participant counts", async () => {
    const bob = await createPlayer({ display_name: "Bob" });
    const charlie = await createPlayer({ display_name: "Charlie" });
    await addToGroup(group.id, bob.id);
    await addToGroup(group.id, charlie.id);

    const t = await createTournament({ group_id: group.id, name: "Spring Cup", created_by: alice.id, status: "active" });
    await addTournamentParticipant(t.id, alice.id);
    await addTournamentParticipant(t.id, bob.id);
    await addTournamentParticipant(t.id, charlie.id);

    const res = await get(`/api/g/test-tourney/tournaments`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Spring Cup");
    expect(body[0].status).toBe("active");
    expect(Number(body[0].participant_count)).toBe(3);
  });
});

describe("GET /api/g/:slug/tournaments/:id", () => {
  let group: { id: string; slug: string };
  let season: { id: string };
  let alice: { id: string };
  let bob: { id: string };
  let charlie: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-tourney-detail" });
    alice = await createPlayer({ display_name: "Alice" });
    bob = await createPlayer({ display_name: "Bob" });
    charlie = await createPlayer({ display_name: "Charlie" });
    await addToGroup(group.id, alice.id);
    await addToGroup(group.id, bob.id);
    await addToGroup(group.id, charlie.id);
    season = await createSeason({ group_id: group.id, name: "S1", is_active: true });
  });

  it("returns 404 for unknown tournament", async () => {
    const res = await get(`/api/g/test-tourney-detail/tournaments/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Tournament not found");
  });

  it("returns tournament detail with participants, standings, and fixtures", async () => {
    const t = await createTournament({ group_id: group.id, name: "Summer Cup", created_by: alice.id, status: "active" });
    await addTournamentParticipant(t.id, alice.id);
    await addTournamentParticipant(t.id, bob.id);
    await addTournamentParticipant(t.id, charlie.id);

    // Record a tournament match: Alice beats Bob
    await createMatch({
      group_id: group.id,
      season_id: season.id,
      winner_id: alice.id,
      loser_id: bob.id,
      match_type: "tournament",
      elo_before_winner: 1200,
      elo_before_loser: 1200,
      elo_change: 16,
    });

    const res = await get(`/api/g/test-tourney-detail/tournaments/${t.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.name).toBe("Summer Cup");
    expect(body.status).toBe("active");

    // Participants
    expect(body.participants).toBeInstanceOf(Array);
    expect(body.participants.length).toBe(3);
    const names = body.participants.map((p: { display_name: string }) => p.display_name).sort();
    expect(names).toEqual(["Alice", "Bob", "Charlie"]);

    // Standings
    expect(body.standings).toBeInstanceOf(Array);
    expect(body.standings.length).toBe(3);

    // Fixtures (3 players = 3 fixtures: A-B, A-C, B-C)
    expect(body.fixtures).toBeInstanceOf(Array);
    expect(body.fixtures.length).toBe(3);
  });
});
