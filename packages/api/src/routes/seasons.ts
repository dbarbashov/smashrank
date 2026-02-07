import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, seasonQueries, matchQueries } from "@smashrank/db";

export const seasonsRoutes = new Hono<AppEnv>();

seasonsRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();

  const seasons = await seasonQueries(sql).listByGroup(group.id);
  return c.json(seasons);
});

seasonsRoutes.get("/:id", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const seasonId = c.req.param("id");

  const season = await seasonQueries(sql).findById(seasonId);
  if (!season) {
    return c.json({ error: "Season not found" }, 404);
  }

  if (season.is_active) {
    // Live standings from group_members
    const leaderboard = await matchQueries(sql).getLeaderboard(group.id);
    const standings = leaderboard.map((entry, i) => ({
      player_id: entry.id,
      display_name: entry.display_name,
      final_elo: entry.elo_rating,
      final_rank: i + 1,
      games_played: entry.games_played,
      wins: entry.wins,
      losses: entry.losses,
    }));
    return c.json({ ...season, standings });
  }

  const snapshots = await seasonQueries(sql).getSnapshots(seasonId);
  return c.json({ ...season, standings: snapshots });
});
