import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, digestQueries } from "@smashrank/db";

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get("/weekly", async (c) => {
  const group = c.get("group");
  const sql = getConnection();

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const stats = await digestQueries(sql).getWeeklyStats(group.id, since);
  return c.json(stats);
});
