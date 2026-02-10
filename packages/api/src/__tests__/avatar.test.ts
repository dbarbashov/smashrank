import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../app.js";
import { cleanDb, createGroup, createPlayer, addToGroup } from "./setup.js";

const app = createApp();

async function get(path: string): Promise<Response> {
  return app.request(path);
}

describe("GET /api/g/:slug/players/:id/avatar", () => {
  let group: { id: string; slug: string };
  let alice: { id: string };

  beforeEach(async () => {
    await cleanDb();
    group = await createGroup({ slug: "test-avatar" });
    alice = await createPlayer({ display_name: "Alice" });
    await addToGroup(group.id, alice.id);
  });

  it("returns 404 when player has no avatar", async () => {
    const res = await get(`/api/g/test-avatar/players/${alice.id}/avatar`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No avatar");
  });

  it("returns 404 for unknown player", async () => {
    const res = await get(`/api/g/test-avatar/players/00000000-0000-0000-0000-000000000000/avatar`);
    expect(res.status).toBe(404);
  });
});
