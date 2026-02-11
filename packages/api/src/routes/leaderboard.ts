import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, matchQueries, seasonQueries } from "@smashrank/db";

export const leaderboardRoutes = new Hono<AppEnv>();

leaderboardRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const seasonId = c.req.query("season");
  const type = c.req.query("type");

  if (seasonId) {
    const matchType = type === "doubles" ? "doubles" : undefined;
    const snapshots = await seasonQueries(sql).getSnapshots(seasonId, matchType);
    if (matchType === "doubles") {
      return c.json(snapshots.map((s, i) => ({
        player_id: s.player_id,
        display_name: s.display_name,
        final_elo: s.doubles_final_elo,
        final_rank: i + 1,
        games_played: s.doubles_games_played,
        wins: s.doubles_wins,
        losses: s.doubles_losses,
      })));
    }
    return c.json(snapshots);
  }

  const leaderboard = await matchQueries(sql).getLeaderboard(
    group.id,
    20,
    type === "doubles" ? "doubles" : undefined,
  );
  return c.json(leaderboard);
});
