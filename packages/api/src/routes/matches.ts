import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, matchQueries } from "@smashrank/db";

export const matchesRoutes = new Hono<AppEnv>();

matchesRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const matchType = c.req.query("type");
  const playerId = c.req.query("player");
  const seasonId = c.req.query("season");
  const tournamentId = c.req.query("tournament");

  const matches = await matchQueries(sql).listByGroup(group.id, {
    limit,
    offset,
    matchType: matchType || undefined,
    playerId: playerId || undefined,
    seasonId: seasonId || undefined,
    tournamentId: tournamentId || undefined,
  });
  return c.json(matches);
});

matchesRoutes.get("/:id", async (c) => {
  const sql = getConnection();
  const matchId = c.req.param("id");

  const match = await matchQueries(sql).findById(matchId);
  if (!match) {
    return c.json({ error: "Match not found" }, 404);
  }

  return c.json(match);
});
