import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, matchQueries } from "@smashrank/db";

export const activityRoutes = new Hono<AppEnv>();

activityRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerId = c.req.query("player");
  const days = parseInt(c.req.query("days") ?? "365", 10);

  const heatmap = await matchQueries(sql).getActivityHeatmap(
    group.id,
    playerId || undefined,
    Math.min(days, 365),
  );
  return c.json(heatmap);
});
