import {
  getConnection,
  playerQueries,
  tournamentQueries,
} from "@smashrank/db";
import { parseTournamentGameCommand, sortStandings } from "@smashrank/core";
import type { Standing } from "@smashrank/core";
import type { SmashRankContext } from "../context.js";
import { recordTournamentMatch } from "../helpers/record-tournament-match.js";
import { evaluateAndPersistTournamentAchievements } from "../helpers/evaluate-tournament-achievements.js";

export async function tgameCommand(ctx: SmashRankContext): Promise<void> {
  if (!ctx.group) {
    await ctx.reply(ctx.t("error.group_only"));
    return;
  }

  const text = ctx.message?.text;
  if (!text) return;

  const reporterUsername = ctx.from?.username;
  const result = parseTournamentGameCommand(text, reporterUsername);

  if (!result.ok) {
    const errorKey = `error.${result.error}`;
    await ctx.reply(ctx.t(errorKey));
    return;
  }

  const { data } = result;
  const sql = getConnection();
  const players = playerQueries(sql);
  const tournaments = tournamentQueries(sql);

  // Find active tournament
  const tournament = await tournaments.findActiveByGroup(ctx.group.id);
  if (!tournament) {
    await ctx.reply(ctx.t("tournament.none_active"));
    return;
  }
  if (tournament.status !== "active") {
    await ctx.reply(ctx.t("tournament.not_started_yet"));
    return;
  }

  // Verify reporter is participant
  const isReporterParticipant = await tournaments.isParticipant(tournament.id, ctx.player.id);
  if (!isReporterParticipant) {
    await ctx.reply(ctx.t("tournament.not_participant"));
    return;
  }

  // Find opponent
  const opponent = await players.findByUsername(data.opponentUsername);
  if (!opponent) {
    await ctx.reply(ctx.t("game.player_not_found", { username: data.opponentUsername }));
    return;
  }

  // Verify opponent is participant
  const isOpponentParticipant = await tournaments.isParticipant(tournament.id, opponent.id);
  if (!isOpponentParticipant) {
    await ctx.reply(ctx.t("tournament.opponent_not_participant", { name: opponent.display_name }));
    return;
  }

  // Check fixture hasn't been played yet
  const fixtures = await tournaments.getFixtures(tournament.id);
  const fixture = fixtures.find(
    (f) =>
      (f.player1_id === ctx.player.id && f.player2_id === opponent.id) ||
      (f.player1_id === opponent.id && f.player2_id === ctx.player.id),
  );

  if (fixture?.match_id) {
    await ctx.reply(ctx.t("tournament.fixture_already_played"));
    return;
  }

  const isDraw = data.winner === "draw";

  const matchResult = await recordTournamentMatch({
    group: ctx.group,
    tournament,
    reporter: ctx.player,
    opponent,
    reporterSets: data.reporterSets,
    opponentSets: data.opponentSets,
    isDraw,
    setScores: data.setScores,
  });

  // Build response
  const setScoresStr = data.setScores
    ? data.setScores.map((s) => `${s.reporterScore}-${s.opponentScore}`).join(", ")
    : null;

  let message: string;
  if (isDraw) {
    const scoreStr = setScoresStr
      ? `${data.reporterSets}-${data.opponentSets} (${setScoresStr})`
      : `${data.reporterSets}-${data.opponentSets}`;
    message = ctx.t("tournament.match_draw", {
      player1: ctx.player.display_name,
      player2: opponent.display_name,
      score: scoreStr,
    });
  } else {
    const winner = data.winner === "reporter" ? ctx.player : opponent;
    const loser = data.winner === "reporter" ? opponent : ctx.player;
    const winnerSets = Math.max(data.reporterSets, data.opponentSets);
    const loserSets = Math.min(data.reporterSets, data.opponentSets);
    const scoreStr = setScoresStr
      ? `${winnerSets}-${loserSets} (${setScoresStr})`
      : `${winnerSets}-${loserSets}`;
    message = ctx.t("tournament.match_result", {
      winner: winner.display_name,
      loser: loser.display_name,
      score: scoreStr,
      change: matchResult.eloChange,
    });
  }

  message += "\n" + ctx.t("tournament.remaining_fixtures", { count: matchResult.remainingFixtures });

  // If tournament complete, show final standings
  if (matchResult.tournamentComplete) {
    const standings = await tournaments.getStandings(tournament.id);
    const allFixtures = await tournaments.getFixtures(tournament.id);

    const h2h = new Map<string, string | null>();
    for (const f of allFixtures) {
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

    const nameMap = new Map(standings.map((s) => [s.player_id, s.display_name]));
    const standingLines = sorted.map((s, i) => {
      return `${i + 1}. ${nameMap.get(s.playerId)} — ${s.points}pts (${s.wins}W ${s.draws}D ${s.losses}L)`;
    });

    message += "\n\n" + ctx.t("tournament.completed", { name: tournament.name });
    if (sorted.length > 0) {
      message += "\n" + ctx.t("tournament.champion", { name: nameMap.get(sorted[0].playerId)! });
    }
    message += "\n" + standingLines.join("\n");

    // Evaluate and persist tournament achievements
    await evaluateAndPersistTournamentAchievements(tournament.id);
  }

  await ctx.reply(message);
}
