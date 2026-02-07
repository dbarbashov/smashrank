import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Group } from "@smashrank/db";
import { resolveGroup } from "./middleware/resolve-group.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { playersRoutes } from "./routes/players.js";
import { matchesRoutes } from "./routes/matches.js";
import { achievementsRoutes } from "./routes/achievements.js";
import { seasonsRoutes } from "./routes/seasons.js";
import { statsRoutes } from "./routes/stats.js";

export type AppEnv = {
  Variables: {
    group: Group;
  };
};

export function createApp(): Hono {
  const app = new Hono();

  app.use("*", cors());

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  const api = new Hono<AppEnv>();
  api.use("*", resolveGroup);
  api.route("/leaderboard", leaderboardRoutes);
  api.route("/players", playersRoutes);
  api.route("/matches", matchesRoutes);
  api.route("/achievements", achievementsRoutes);
  api.route("/seasons", seasonsRoutes);
  api.route("/stats", statsRoutes);

  app.route("/api/g/:slug", api);

  return app;
}
