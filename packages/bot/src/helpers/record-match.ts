import type postgres from "postgres";
import {
  getConnection,
  matchQueries,
  achievementQueries,
  groupQueries,
  playerQueries,
} from "@smashrank/db";
import type { Player, Group, GroupMember, Match } from "@smashrank/db";
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
  winnerMember: GroupMember;
  loserMember: GroupMember;
}

export async function recordMatch(input: RecordMatchInput): Promise<RecordMatchResult> {
  const sql = getConnection();
  const matches = matchQueries(sql);
  const achievements = achievementQueries(sql);
  const groups = groupQueries(sql);

  // Ensure all participants are members of the group (returns GroupMember with stats)
  const [winnerMember, loserMember] = await Promise.all([
    groups.ensureMembership(input.group.id, input.winner.id),
    groups.ensureMembership(input.group.id, input.loser.id),
  ]);

  const season = await ensureActiveSeason(input.group.id);

  // Calculate ELO using group-scoped stats
  const eloResult = calculateElo({
    winnerRating: winnerMember.elo_rating,
    loserRating: loserMember.elo_rating,
    winnerGamesPlayed: winnerMember.games_played,
    loserGamesPlayed: loserMember.games_played,
  });

  // Calculate streaks using group-scoped stats
  const winnerStreak = updateStreak(winnerMember.current_streak, winnerMember.best_streak, true);
  const loserStreak = updateStreak(loserMember.current_streak, loserMember.best_streak, false);

  let match!: Match;
  let newAchievements: AchievementUnlock[] = [];

  // Check if achievements are enabled for this group
  const achievementsEnabled = input.group.settings?.achievements !== false;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txMatches = matchQueries(txSql);
    const txAchievements = achievementQueries(txSql);
    const txGroups = groupQueries(txSql);

    match = await txMatches.create({
      match_type: input.matchType ?? "singles",
      season_id: season.id,
      group_id: input.group.id,
      winner_id: input.winner.id,
      loser_id: input.loser.id,
      winner_score: input.winnerSets,
      loser_score: input.loserSets,
      set_scores: input.setScores,
      elo_before_winner: winnerMember.elo_rating,
      elo_before_loser: loserMember.elo_rating,
      elo_change: eloResult.change,
      reported_by: input.reportedBy,
    });

    await txGroups.updateGroupElo(
      input.group.id,
      input.winner.id,
      eloResult.winnerNewRating,
      true,
      winnerStreak.currentStreak,
      winnerStreak.bestStreak,
    );

    await txGroups.updateGroupElo(
      input.group.id,
      input.loser.id,
      eloResult.loserNewRating,
      false,
      loserStreak.currentStreak,
      loserStreak.bestStreak,
    );

    // Evaluate and persist achievements
    if (achievementsEnabled) {
      const [winnerExisting, loserExisting, matchCount, rankData, consecutiveWins] = await Promise.all([
        txAchievements.getPlayerAchievementIds(input.winner.id, input.group.id),
        txAchievements.getPlayerAchievementIds(input.loser.id, input.group.id),
        txMatches.countMatchesBetween(input.winner.id, input.loser.id, input.group.id),
        txMatches.getPlayerStats(input.winner.id, input.group.id),
        txMatches.getConsecutiveWinsAgainst(input.winner.id, input.loser.id, input.group.id),
      ]);

      newAchievements = evaluateAchievements({
        winnerId: input.winner.id,
        loserId: input.loser.id,
        winnerStreak: winnerStreak.currentStreak,
        winnerStreakBefore: winnerMember.current_streak,
        winnerElo: winnerMember.elo_rating,
        loserElo: loserMember.elo_rating,
        winnerGamesPlayed: winnerMember.games_played + 1,
        loserGamesPlayed: loserMember.games_played + 1,
        winnerWins: winnerMember.wins + 1,
        setScores: input.setScores,
        matchesBetween: matchCount,
        winnerRank: rankData?.rank ?? null,
        winnerExistingAchievements: winnerExisting,
        loserExistingAchievements: loserExisting,
        loserStreak: loserStreak.currentStreak,
        loserConsecutiveLossesVsWinner: consecutiveWins,
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

  // Update last_active for both players (fire-and-forget, outside transaction)
  const players = playerQueries(sql);
  await Promise.all([
    players.updateLastActive(input.winner.id),
    players.updateLastActive(input.loser.id),
  ]);

  return { match, eloResult, winnerStreak, loserStreak, newAchievements, winnerMember, loserMember };
}
