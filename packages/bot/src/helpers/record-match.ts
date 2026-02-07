import type postgres from "postgres";
import {
  getConnection,
  playerQueries,
  matchQueries,
  achievementQueries,
  groupQueries,
} from "@smashrank/db";
import type { Player, Group, Match } from "@smashrank/db";
import {
  calculateElo,
  updateStreak,
  evaluateAchievements,
} from "@smashrank/core";
import type { EloResult, StreakResult, AchievementUnlock } from "@smashrank/core";
import { ensureActiveSeason } from "./ensure-season.js";

export interface RecordMatchInput {
  group: Group;
  winner: Player;
  loser: Player;
  winnerSets: number;
  loserSets: number;
  /** Set scores oriented as { w, l } where w = match winner's score */
  setScores: { w: number; l: number }[] | null;
  reportedBy: string;
  matchType?: string;
  /** Optional: partner IDs for doubles */
  winnerPartnerId?: string;
  loserPartnerId?: string;
}

export interface RecordMatchResult {
  match: Match;
  eloResult: EloResult;
  winnerStreak: StreakResult;
  loserStreak: StreakResult;
  newAchievements: AchievementUnlock[];
}

export async function recordMatch(input: RecordMatchInput): Promise<RecordMatchResult> {
  const sql = getConnection();
  const players = playerQueries(sql);
  const matches = matchQueries(sql);
  const achievements = achievementQueries(sql);

  const groups = groupQueries(sql);

  // Ensure all participants are members of the group
  await Promise.all([
    groups.ensureMembership(input.group.id, input.winner.id),
    groups.ensureMembership(input.group.id, input.loser.id),
  ]);

  const season = await ensureActiveSeason(input.group.id);

  // Calculate ELO
  const eloResult = calculateElo({
    winnerRating: input.winner.elo_rating,
    loserRating: input.loser.elo_rating,
    winnerGamesPlayed: input.winner.games_played,
    loserGamesPlayed: input.loser.games_played,
  });

  // Calculate streaks
  const winnerStreak = updateStreak(input.winner.current_streak, input.winner.best_streak, true);
  const loserStreak = updateStreak(input.loser.current_streak, input.loser.best_streak, false);

  let match!: Match;
  let newAchievements: AchievementUnlock[] = [];

  // Check if achievements are enabled for this group
  const achievementsEnabled = input.group.settings?.achievements !== false;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txPlayers = playerQueries(txSql);
    const txMatches = matchQueries(txSql);
    const txAchievements = achievementQueries(txSql);

    match = await txMatches.create({
      match_type: input.matchType ?? "singles",
      season_id: season.id,
      group_id: input.group.id,
      winner_id: input.winner.id,
      loser_id: input.loser.id,
      winner_score: input.winnerSets,
      loser_score: input.loserSets,
      set_scores: input.setScores,
      elo_before_winner: input.winner.elo_rating,
      elo_before_loser: input.loser.elo_rating,
      elo_change: eloResult.change,
      reported_by: input.reportedBy,
    });

    await txPlayers.updateElo(
      input.winner.id,
      eloResult.winnerNewRating,
      true,
      winnerStreak.currentStreak,
      winnerStreak.bestStreak,
    );

    await txPlayers.updateElo(
      input.loser.id,
      eloResult.loserNewRating,
      false,
      loserStreak.currentStreak,
      loserStreak.bestStreak,
    );

    // Evaluate and persist achievements
    if (achievementsEnabled) {
      const [winnerExisting, loserExisting, matchCount, rankData] = await Promise.all([
        txAchievements.getPlayerAchievementIds(input.winner.id),
        txAchievements.getPlayerAchievementIds(input.loser.id),
        txMatches.countMatchesBetween(input.winner.id, input.loser.id),
        txMatches.getPlayerStats(input.winner.id, input.group.id),
      ]);

      newAchievements = evaluateAchievements({
        winnerId: input.winner.id,
        loserId: input.loser.id,
        winnerStreak: winnerStreak.currentStreak,
        winnerStreakBefore: input.winner.current_streak,
        winnerElo: input.winner.elo_rating,
        loserElo: input.loser.elo_rating,
        winnerGamesPlayed: input.winner.games_played + 1,
        loserGamesPlayed: input.loser.games_played + 1,
        winnerWins: input.winner.wins + 1,
        setScores: input.setScores,
        matchesBetween: matchCount,
        winnerRank: rankData?.rank ?? null,
        winnerExistingAchievements: winnerExisting,
        loserExistingAchievements: loserExisting,
      });

      if (newAchievements.length > 0) {
        await txAchievements.unlockMany(
          newAchievements.map((a) => ({
            playerId: a.playerId,
            achievementId: a.achievementId,
            matchId: match.id,
          })),
        );
      }
    }
  });

  return { match, eloResult, winnerStreak, loserStreak, newAchievements };
}
