import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, matchQueries, seasonQueries } from "@smashrank/db";

export const leaderboardRoutes = new Hono<AppEnv>();

leaderboardRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const seasonId = c.req.query("season");

  if (seasonId) {
    const snapshots = await seasonQueries(sql).getSnapshots(seasonId);
    return c.json(snapshots);
  }

  const leaderboard = await matchQueries(sql).getLeaderboard(group.id);
  return c.json(leaderboard);
});
