import type postgres from "postgres";
import {
  getConnection,
  playerQueries,
  matchQueries,
  tournamentQueries,
  achievementQueries,
} from "@smashrank/db";
import type { Tournament } from "@smashrank/db";
import {
  calculateDrawElo,
  evaluateTournamentAchievements,
  sortStandings,
} from "@smashrank/core";
import type { AchievementUnlock, Standing } from "@smashrank/core";
import { ensureActiveSeason } from "./ensure-season.js";

export interface ForceCompleteResult {
  forfeitedFixtures: number;
  achievements: AchievementUnlock[];
  winnerId: string | null;
  winnerName: string | null;
}

export async function forceCompleteTournament(
  tournament: Tournament,
  groupId: string,
): Promise<ForceCompleteResult> {
  const sql = getConnection();
  const season = await ensureActiveSeason(groupId);

  let forfeitedFixtures = 0;
  let achievements: AchievementUnlock[] = [];
  let winnerId: string | null = null;
  let winnerName: string | null = null;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txPlayers = playerQueries(txSql);
    const txMatches = matchQueries(txSql);
    const txTournaments = tournamentQueries(txSql);
    const txAchievements = achievementQueries(txSql);

    // Get unplayed fixtures
    const unplayed = await txTournaments.getUnplayedFixtures(tournament.id);
    forfeitedFixtures = unplayed.length;

    // Insert 0-0 draw matches for each unplayed fixture
    for (const fixture of unplayed) {
      const playerA = await txPlayers.findById(fixture.player1_id);
      const playerB = await txPlayers.findById(fixture.player2_id);
      if (!playerA || !playerB) continue;

      const drawResult = calculateDrawElo({
        playerARating: playerA.elo_rating,
        playerBRating: playerB.elo_rating,
        playerAGamesPlayed: playerA.games_played,
        playerBGamesPlayed: playerB.games_played,
      });

      await txMatches.create({
        match_type: "tournament",
        season_id: season.id,
        group_id: groupId,
        winner_id: playerA.id,
        loser_id: playerB.id,
        winner_score: 0,
        loser_score: 0,
        set_scores: null,
        elo_before_winner: playerA.elo_rating,
        elo_before_loser: playerB.elo_rating,
        elo_change: drawResult.playerAChange,
        reported_by: playerA.id,
        tournament_id: tournament.id,
      });

      await txPlayers.updateEloForDraw(playerA.id, drawResult.playerANewRating);
      await txPlayers.updateEloForDraw(playerB.id, drawResult.playerBNewRating);

      await txTournaments.updateStanding(tournament.id, playerA.id, "draw", 0, 0);
      await txTournaments.updateStanding(tournament.id, playerB.id, "draw", 0, 0);
    }

    // Complete the tournament
    await txTournaments.updateStatus(tournament.id, "completed");

    // Evaluate tournament achievements
    const participants = await txTournaments.getParticipants(tournament.id);
    const standings = await txTournaments.getStandings(tournament.id);
    const participantIds = participants.map((p) => p.player_id);

    // Build standings map
    const standingsMap = new Map<string, { wins: number; draws: number; losses: number }>();
    for (const s of standings) {
      standingsMap.set(s.player_id, { wins: s.wins, draws: s.draws, losses: s.losses });
    }

    // Build H2H map for tiebreaking
    const fixtures = await txTournaments.getFixtures(tournament.id);
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
    const sortableStandings: Standing[] = standings.map((s) => ({
      playerId: s.player_id,
      points: s.points,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      setsWon: s.sets_won,
      setsLost: s.sets_lost,
      eloRating: s.elo_rating,
    }));
    const sorted = sortStandings(sortableStandings, h2h);
    winnerId = sorted.length > 0 ? sorted[0].playerId : null;
    winnerName = winnerId
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
      const existing = await txAchievements.getPlayerAchievementIds(playerId);
      existingAchievements.set(playerId, existing);
    }

    const totalFixturesPerPlayer = participantIds.length - 1;

    achievements = evaluateTournamentAchievements({
      participantIds,
      standings: standingsMap,
      drawCounts,
      existingAchievements,
      fixturesPlayed,
      totalFixturesPerPlayer,
      winnerId,
    });

    // Persist tournament achievements (match_id null for tournament-level achievements)
    if (achievements.length > 0) {
      for (const a of achievements) {
        await txSql`
          INSERT INTO player_achievements (player_id, achievement_id)
          VALUES (${a.playerId}, ${a.achievementId})
          ON CONFLICT (player_id, achievement_id) DO NOTHING
        `;
      }
    }
  });

  return { forfeitedFixtures, achievements, winnerId, winnerName };
}
