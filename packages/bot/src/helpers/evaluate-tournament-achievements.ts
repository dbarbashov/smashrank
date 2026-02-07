import {
  getConnection,
  tournamentQueries,
  achievementQueries,
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

  const participants = await tournaments.getParticipants(tournamentId);
  const standings = await tournaments.getStandings(tournamentId);
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
  for (const f of fixtures) {
    if (f.match_id) {
      fixturesPlayed.set(f.player1_id, (fixturesPlayed.get(f.player1_id) ?? 0) + 1);
      fixturesPlayed.set(f.player2_id, (fixturesPlayed.get(f.player2_id) ?? 0) + 1);
      if (f.winner_score === f.loser_score) {
        drawCounts.set(f.player1_id, (drawCounts.get(f.player1_id) ?? 0) + 1);
        drawCounts.set(f.player2_id, (drawCounts.get(f.player2_id) ?? 0) + 1);
      }
    }
  }

  // Existing achievements
  const existingAchievements = new Map<string, string[]>();
  for (const playerId of participantIds) {
    const existing = await achievements.getPlayerAchievementIds(playerId);
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
  });

  // Persist
  for (const a of unlocks) {
    await sql`
      INSERT INTO player_achievements (player_id, achievement_id)
      VALUES (${a.playerId}, ${a.achievementId})
      ON CONFLICT (player_id, achievement_id) DO NOTHING
    `;
  }

  return { achievements: unlocks, winnerId, winnerName };
}
