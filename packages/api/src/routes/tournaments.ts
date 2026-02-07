import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getConnection, tournamentQueries } from "@smashrank/db";
import { sortStandings } from "@smashrank/core";
import type { Standing } from "@smashrank/core";

export const tournamentsRoutes = new Hono<AppEnv>();

tournamentsRoutes.get("/", async (c) => {
  const group = c.get("group");
  const sql = getConnection();
  const tournaments = tournamentQueries(sql);

  const list = await tournaments.listByGroup(group.id);
  return c.json(list);
});

tournamentsRoutes.get("/:id", async (c) => {
  const sql = getConnection();
  const tournaments = tournamentQueries(sql);
  const id = c.req.param("id");

  const tournament = await tournaments.findById(id);
  if (!tournament) {
    return c.json({ error: "Tournament not found" }, 404);
  }

  const participants = await tournaments.getParticipants(tournament.id);
  const standings = await tournaments.getStandings(tournament.id);
  const fixtures = await tournaments.getFixtures(tournament.id);

  // Build H2H map for tiebreaking
  const h2h = new Map<string, string | null>();
  for (const f of fixtures) {
    const key = f.player1_id < f.player2_id
      ? `${f.player1_id}:${f.player2_id}`
      : `${f.player2_id}:${f.player1_id}`;
    if (f.winner_id && f.winner_score !== f.loser_score) {
      h2h.set(key, f.winner_id);
    } else {
      h2h.set(key, null);
    }
  }

  const sortable: Standing[] = standings.map((s) => ({
    playerId: s.player_id,
    points: s.points,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    setsWon: s.sets_won,
    setsLost: s.sets_lost,
    eloRating: s.elo_rating,
  }));
  const sorted = sortStandings(sortable, h2h);

  // Enrich sorted standings with display names
  const nameMap = new Map(standings.map((s) => [s.player_id, s.display_name]));
  const sortedStandings = sorted.map((s, i) => ({
    rank: i + 1,
    player_id: s.playerId,
    display_name: nameMap.get(s.playerId) ?? "",
    points: s.points,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    sets_won: s.setsWon,
    sets_lost: s.setsLost,
    set_diff: s.setsWon - s.setsLost,
  }));

  return c.json({
    ...tournament,
    participants: participants.map((p) => ({
      player_id: p.player_id,
      display_name: p.display_name,
      elo_rating: p.elo_rating,
    })),
    standings: sortedStandings,
    fixtures: fixtures.map((f) => ({
      player1_id: f.player1_id,
      player1_name: f.player1_name,
      player2_id: f.player2_id,
      player2_name: f.player2_name,
      played: !!f.match_id,
      winner_id: f.winner_id,
      winner_score: f.winner_score,
      loser_score: f.loser_score,
      is_draw: f.match_id ? f.winner_score === f.loser_score : false,
    })),
  });
});
