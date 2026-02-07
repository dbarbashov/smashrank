import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import {
  getConnection,
  playerQueries,
  matchQueries,
  achievementQueries,
} from "@smashrank/db";

export const playersRoutes = new Hono<AppEnv>();

playersRoutes.get("/:id", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerId = c.req.param("id");

  const player = await playerQueries(sql).findById(playerId);
  if (!player) {
    return c.json({ error: "Player not found" }, 404);
  }

  const stats = await matchQueries(sql).getPlayerStats(playerId, group.id);
  const achievements = await achievementQueries(sql).getPlayerAchievements(playerId);

  return c.json({
    ...player,
    rank: stats?.rank ?? null,
    total_in_group: stats?.total_in_group ?? 0,
    achievement_count: achievements.length,
  });
});

playersRoutes.get("/:id/elo-history", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerId = c.req.param("id");

  const history = await matchQueries(sql).getEloHistory(playerId, group.id);
  return c.json(history);
});

playersRoutes.get("/:id/matches", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerId = c.req.param("id");
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const matches = await matchQueries(sql).listByPlayer(playerId, group.id, {
    limit,
    offset,
  });
  return c.json(matches);
});

playersRoutes.get("/:id/achievements", async (c) => {
  const sql = getConnection();
  const playerId = c.req.param("id");

  const achievements = await achievementQueries(sql).getPlayerAchievements(playerId);
  return c.json(achievements);
});

playersRoutes.get("/:id/h2h/:otherId", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerA = c.req.param("id");
  const playerB = c.req.param("otherId");

  const h2h = await matchQueries(sql).getH2H(playerA, playerB, group.id);
  return c.json(h2h);
});
