import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import {
  getConnection,
  achievementQueries,
  type AchievementHolderRow,
} from "@smashrank/db";

export const achievementsRoutes = new Hono<AppEnv>();

achievementsRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const definitions = await achievementQueries(sql).listDefinitionsWithHolderCounts(group.id);
  return c.json(definitions);
});

achievementsRoutes.get("/recent", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const limit = parseInt(c.req.query("limit") ?? "10", 10);
  const matchType = c.req.query("type");

  const recent = await achievementQueries(sql).listRecent(
    group.id,
    limit,
    matchType,
  );
  return c.json(recent);
});

function achievementSource(holder: AchievementHolderRow) {
  if (holder.source_type === "meta" || holder.meta_context) {
    return {
      type: "meta" as const,
      trigger_achievement_ids: Array.isArray(holder.meta_context?.trigger_achievement_ids)
        ? holder.meta_context.trigger_achievement_ids
        : [],
      category: typeof holder.meta_context?.category === "string"
        ? holder.meta_context.category
        : null,
    };
  }
  if (
    holder.match_id &&
    holder.match_winner_id &&
    holder.match_loser_id &&
    holder.match_winner_score !== null &&
    holder.match_loser_score !== null
  ) {
    const isWinner = holder.player_id === holder.match_winner_id;
    const rawSets = typeof holder.match_set_scores === "string"
      ? JSON.parse(holder.match_set_scores) as { w: number; l: number }[]
      : holder.match_set_scores;

    return {
      type: "match" as const,
      id: holder.match_id,
      match_type: holder.match_type,
      opponent_id: isWinner ? holder.match_loser_id : holder.match_winner_id,
      opponent_name: isWinner ? holder.loser_name : holder.winner_name,
      player_score: isWinner ? holder.match_winner_score : holder.match_loser_score,
      opponent_score: isWinner ? holder.match_loser_score : holder.match_winner_score,
      set_scores: rawSets?.map((set) =>
        isWinner ? set : { w: set.l, l: set.w },
      ) ?? null,
    };
  }

  if (holder.tournament_id) {
    return {
      type: "tournament" as const,
      id: holder.tournament_id,
      name: holder.tournament_name,
    };
  }

  if (holder.season_id) {
    return {
      type: "season" as const,
      id: holder.season_id,
      name: holder.season_name,
    };
  }

  return null;
}

achievementsRoutes.get("/:achievementId", async (c) => {
  const group = c.get("group");
  const achievementId = c.req.param("achievementId");
  const sql = getConnection();
  const achievements = achievementQueries(sql);

  const [definition, holders, totalPlayers] = await Promise.all([
    achievements.getDefinition(achievementId),
    achievements.listHolders(group.id, achievementId),
    achievements.countGroupPlayers(group.id),
  ]);

  if (!definition) {
    return c.json({ error: "Achievement not found" }, 404);
  }

  return c.json({
    ...definition,
    holder_count: holders.length,
    total_players: totalPlayers,
    holders: holders.map((holder) => ({
      id: holder.id,
      player_id: holder.player_id,
      display_name: holder.display_name,
      unlocked_at: holder.unlocked_at,
      source: achievementSource(holder),
    })),
  });
});
