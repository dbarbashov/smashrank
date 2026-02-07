import type postgres from "postgres";
import {
  getConnection,
  matchQueries,
  tournamentQueries,
  groupQueries,
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
    const txMatches = matchQueries(txSql);
    const txTournaments = tournamentQueries(txSql);
    const txGroups = groupQueries(txSql);

    // Get unplayed fixtures
    const unplayed = await txTournaments.getUnplayedFixtures(tournament.id);
    forfeitedFixtures = unplayed.length;

    // Insert 0-0 draw matches for each unplayed fixture
    for (const fixture of unplayed) {
      const memberA = await txGroups.getGroupMember(groupId, fixture.player1_id);
      const memberB = await txGroups.getGroupMember(groupId, fixture.player2_id);
      if (!memberA || !memberB) continue;

      const drawResult = calculateDrawElo({
        playerARating: memberA.elo_rating,
        playerBRating: memberB.elo_rating,
        playerAGamesPlayed: memberA.games_played,
        playerBGamesPlayed: memberB.games_played,
      });

      await txMatches.create({
        match_type: "tournament",
        season_id: season.id,
        group_id: groupId,
        winner_id: fixture.player1_id,
        loser_id: fixture.player2_id,
        winner_score: 0,
        loser_score: 0,
        set_scores: null,
        elo_before_winner: memberA.elo_rating,
        elo_before_loser: memberB.elo_rating,
        elo_change: drawResult.playerAChange,
        reported_by: fixture.player1_id,
        tournament_id: tournament.id,
      });

      await txGroups.updateGroupEloForDraw(groupId, fixture.player1_id, drawResult.playerANewRating);
      await txGroups.updateGroupEloForDraw(groupId, fixture.player2_id, drawResult.playerBNewRating);

      await txTournaments.updateStanding(tournament.id, fixture.player1_id, "draw", 0, 0);
      await txTournaments.updateStanding(tournament.id, fixture.player2_id, "draw", 0, 0);
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
