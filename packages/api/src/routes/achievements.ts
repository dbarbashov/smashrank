import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, achievementQueries } from "@smashrank/db";

export const achievementsRoutes = new Hono<AppEnv>();

achievementsRoutes.get("/", async (c) => {
  const sql = getConnection();
  const definitions = await achievementQueries(sql).listDefinitions();
  return c.json(definitions);
});

achievementsRoutes.get("/recent", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const limit = parseInt(c.req.query("limit") ?? "10", 10);

  const recent = await achievementQueries(sql).listRecent(group.id, limit);
  return c.json(recent);
});
