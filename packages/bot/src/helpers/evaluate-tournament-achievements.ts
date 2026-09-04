import {
  getConnection,
  tournamentQueries,
  achievementQueries,
  groupQueries,
} from "@smashrank/db";
import {
  evaluateTournamentAchievements,
  sortStandings,
} from "@smashrank/core";
import type { AchievementUnlock, Standing } from "@smashrank/core";

export interface TournamentAchievementResult {
  achievements: AchievementUnlock[];
  winnerId: string | null;
  winnerName: string | null;
}

/**
 * Evaluate and persist tournament achievements after a tournament completes.
 * Call this after the tournament status is set to 'completed'.
 */
export async function evaluateAndPersistTournamentAchievements(
  tournamentId: string,
): Promise<TournamentAchievementResult> {
  const sql = getConnection();
  const tournaments = tournamentQueries(sql);
  const achievements = achievementQueries(sql);
  const groups = groupQueries(sql);

  const [tournament, participants, standings] = await Promise.all([
    tournaments.findById(tournamentId),
    tournaments.getParticipants(tournamentId),
    tournaments.getStandings(tournamentId),
  ]);
  if (!tournament) {
    throw new Error(`Tournament ${tournamentId} not found`);
  }
  const group = await groups.findById(tournament.group_id);
  const participantIds = participants.map((p) => p.player_id);

  // Build standings map
  const standingsMap = new Map<string, { wins: number; draws: number; losses: number }>();
  for (const s of standings) {
    standingsMap.set(s.player_id, { wins: s.wins, draws: s.draws, losses: s.losses });
  }

  // Build H2H map for tiebreaking
  const fixtures = await tournaments.getFixtures(tournamentId);
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

  // Sort standings with tiebreakers
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
  const winnerId = sorted.length > 0 ? sorted[0].playerId : null;
  const winnerName = winnerId
    ? (participants.find((p) => p.player_id === winnerId)?.display_name ?? null)
    : null;

  // Count draws and fixtures played per player
  const drawCounts = new Map<string, number>();
  const fixturesPlayed = new Map<string, number>();
  const beatenOpponentIds = new Map<string, string[]>();
  const firstMatchResult = new Map<string, "win" | "draw" | "loss">();
  const chronologicalFixtures = fixtures
    .filter((fixture) => fixture.match_id && fixture.played_at)
    .sort((a, b) => +new Date(a.played_at!) - +new Date(b.played_at!));
  for (const f of fixtures) {
    if (f.match_id) {
      fixturesPlayed.set(f.player1_id, (fixturesPlayed.get(f.player1_id) ?? 0) + 1);
      fixturesPlayed.set(f.player2_id, (fixturesPlayed.get(f.player2_id) ?? 0) + 1);
      if (f.winner_score === f.loser_score) {
        drawCounts.set(f.player1_id, (drawCounts.get(f.player1_id) ?? 0) + 1);
        drawCounts.set(f.player2_id, (drawCounts.get(f.player2_id) ?? 0) + 1);
      } else if (f.winner_id) {
        const loserId = f.winner_id === f.player1_id ? f.player2_id : f.player1_id;
        beatenOpponentIds.set(f.winner_id, [...(beatenOpponentIds.get(f.winner_id) ?? []), loserId]);
      }
    }
  }
  for (const fixture of chronologicalFixtures) {
    for (const playerId of [fixture.player1_id, fixture.player2_id]) {
      if (firstMatchResult.has(playerId)) continue;
      firstMatchResult.set(
        playerId,
        fixture.winner_score === fixture.loser_score
          ? "draw"
          : fixture.winner_id === playerId ? "win" : "loss",
      );
    }
  }

  // Existing achievements
  const existingAchievements = new Map<string, string[]>();
  for (const playerId of participantIds) {
    const existing = await achievements.getPlayerAchievementIds(playerId, tournament.group_id);
    existingAchievements.set(playerId, existing);
  }

  const totalFixturesPerPlayer = participantIds.length - 1;

  const unlocks = evaluateTournamentAchievements({
    participantIds,
    standings: standingsMap,
    drawCounts,
    existingAchievements,
    fixturesPlayed,
    totalFixturesPerPlayer,
    winnerId,
    sortedPlayerIds: sorted.map((standing) => standing.playerId),
    points: new Map(standings.map((standing) => [standing.player_id, standing.points])),
    beatenOpponentIds,
    firstMatchResult,
  });

  const inserted = group?.settings?.achievements === false
    ? []
    : await achievements.awardWithMeta(
      tournament.group_id,
      unlocks,
      { type: "tournament", id: tournamentId },
      tournament.completed_at ?? new Date(),
    );

  return { achievements: inserted, winnerId, winnerName };
}
