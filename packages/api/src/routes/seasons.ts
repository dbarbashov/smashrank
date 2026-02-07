import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, seasonQueries } from "@smashrank/db";

export const seasonsRoutes = new Hono<AppEnv>();

seasonsRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();

  const seasons = await seasonQueries(sql).listByGroup(group.id);
  return c.json(seasons);
});

seasonsRoutes.get("/:id", async (c) => {
  const sql = getConnection();
  const seasonId = c.req.param("id");

  const season = await seasonQueries(sql).findById(seasonId);
  if (!season) {
    return c.json({ error: "Season not found" }, 404);
  }

  const snapshots = await seasonQueries(sql).getSnapshots(seasonId);
  return c.json({ ...season, standings: snapshots });
});
