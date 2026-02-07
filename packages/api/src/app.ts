import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Group } from "@smashrank/db";
import { getConnection, groupQueries } from "@smashrank/db";
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

  // Group info endpoint (outside resolveGroup middleware — does its own lookup)
  app.get("/api/g/:slug/info", async (c) => {
    const slug = c.req.param("slug");
    const sql = getConnection();
    const group = await groupQueries(sql).findBySlug(slug);
    if (!group) {
      return c.json({ error: "Group not found" }, 404);
    }
    return c.json({ name: group.name, slug: group.slug, language: group.language });
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

  // Static file serving (production only)
  const staticDir = process.env.STATIC_DIR;
  if (staticDir) {
    app.use("*", serveStatic({ root: staticDir }));

    // SPA fallback: serve index.html for non-API routes
    app.get("*", serveStatic({ root: staticDir, path: "index.html" }));
  }

  return app;
}
