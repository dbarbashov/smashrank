import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import {
  getConnection,
  playerQueries,
  matchQueries,
  achievementQueries,
  groupQueries,
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

  const member = await groupQueries(sql).getGroupMember(group.id, playerId);
  const stats = await matchQueries(sql).getPlayerStats(playerId, group.id);
  const achievements = await achievementQueries(sql).getPlayerAchievements(playerId, group.id);

  return c.json({
    ...player,
    elo_rating: member?.elo_rating ?? 1200,
    games_played: member?.games_played ?? 0,
    wins: member?.wins ?? 0,
    losses: member?.losses ?? 0,
    current_streak: member?.current_streak ?? 0,
    best_streak: member?.best_streak ?? 0,
    doubles_elo_rating: member?.doubles_elo_rating ?? 1200,
    doubles_games_played: member?.doubles_games_played ?? 0,
    doubles_wins: member?.doubles_wins ?? 0,
    doubles_losses: member?.doubles_losses ?? 0,
    doubles_current_streak: member?.doubles_current_streak ?? 0,
    doubles_best_streak: member?.doubles_best_streak ?? 0,
    rank: stats?.rank ?? null,
    total_in_group: stats?.total_in_group ?? 0,
    achievement_count: achievements.length,
  });
});

playersRoutes.get("/:id/avatar", async (c) => {
  const sql = getConnection();
  const playerId = c.req.param("id");

  const player = await playerQueries(sql).findById(playerId);
  if (!player?.avatar_file_id) {
    return c.json({ error: "No avatar" }, 404);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return c.json({ error: "Bot token not configured" }, 500);
  }

  try {
    const fileResp = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${player.avatar_file_id}`,
    );
    const fileData = (await fileResp.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!fileData.ok || !fileData.result?.file_path) {
      return c.json({ error: "File not found" }, 404);
    }

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    return c.redirect(fileUrl, 302);
  } catch {
    return c.json({ error: "Failed to fetch avatar" }, 500);
  }
});

playersRoutes.get("/:id/elo-history", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerId = c.req.param("id");
  const type = c.req.query("type");

  const history = await matchQueries(sql).getEloHistory(
    playerId,
    group.id,
    type === "doubles" ? "doubles" : undefined,
  );
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

playersRoutes.get("/:id/opponents", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerId = c.req.param("id");
  const limit = parseInt(c.req.query("limit") ?? "5", 10);

  const opponents = await matchQueries(sql).getFrequentOpponents(playerId, group.id, limit);
  return c.json(opponents);
});

playersRoutes.get("/:id/h2h/:otherId", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const playerA = c.req.param("id");
  const playerB = c.req.param("otherId");

  const [h2h, playerAData, playerBData, eloHistoryA, eloHistoryB, streakAvsB, streakBvsA] =
    await Promise.all([
      matchQueries(sql).getH2H(playerA, playerB, group.id),
      playerQueries(sql).findById(playerA),
      playerQueries(sql).findById(playerB),
      matchQueries(sql).getEloHistory(playerA, group.id),
      matchQueries(sql).getEloHistory(playerB, group.id),
      matchQueries(sql).getConsecutiveWinsAgainst(playerA, playerB, group.id),
      matchQueries(sql).getConsecutiveWinsAgainst(playerB, playerA, group.id),
    ]);

  const memberA = await groupQueries(sql).getGroupMember(group.id, playerA);
  const memberB = await groupQueries(sql).getGroupMember(group.id, playerB);

  return c.json({
    ...h2h,
    playerA: playerAData
      ? { id: playerAData.id, display_name: playerAData.display_name, elo_rating: memberA?.elo_rating ?? 1200 }
      : null,
    playerB: playerBData
      ? { id: playerBData.id, display_name: playerBData.display_name, elo_rating: memberB?.elo_rating ?? 1200 }
      : null,
    eloHistoryA,
    eloHistoryB,
    currentStreak: streakAvsB > 0
      ? { playerId: playerA, count: streakAvsB }
      : streakBvsA > 0
        ? { playerId: playerB, count: streakBvsA }
        : null,
  });
});
