import type postgres from "postgres";
import {
  getConnection,
  playerQueries,
  matchQueries,
  tournamentQueries,
} from "@smashrank/db";
import type { Tournament } from "@smashrank/db";
import { calculateDrawElo } from "@smashrank/core";
import type { AchievementUnlock } from "@smashrank/core";
import { ensureActiveSeason } from "./ensure-season.js";
import { evaluateAndPersistTournamentAchievements } from "./evaluate-tournament-achievements.js";

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
  });

  // Evaluate and persist tournament achievements (outside transaction, reads committed data)
  const achievementResult = await evaluateAndPersistTournamentAchievements(tournament.id);
  achievements = achievementResult.achievements;
  winnerId = achievementResult.winnerId;
  winnerName = achievementResult.winnerName;

  return { forfeitedFixtures, achievements, winnerId, winnerName };
}
