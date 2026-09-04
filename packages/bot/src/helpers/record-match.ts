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
  evaluatePlayerHistoryAchievements,
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
  /** Origin metadata populated only by the /challenge flow. */
  challengeType?: "challenge";
  challengeInitiatorId?: string;
  challengeTargetRank?: number | null;
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
  const groups = groupQueries(sql);

  // Ensure all participants are members of the group (returns GroupMember with stats)
  const [winnerMember, loserMember] = await Promise.all([
    groups.ensureMembership(input.group.id, input.winner.id),
    groups.ensureMembership(input.group.id, input.loser.id),
  ]);

  const season = await ensureActiveSeason(input.group.id);

  const [winnerRankBeforeData, loserRankBeforeData, lossesVsLoserBefore] = await Promise.all([
    matches.getPlayerStats(input.winner.id, input.group.id),
    matches.getPlayerStats(input.loser.id, input.group.id),
    matches.getConsecutiveLossesAgainst(input.winner.id, input.loser.id, input.group.id),
  ]);

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
      winner_partner_id: input.winnerPartnerId,
      loser_partner_id: input.loserPartnerId,
      winner_rank_before: winnerRankBeforeData?.rank ?? null,
      loser_rank_before: loserRankBeforeData?.rank ?? null,
      challenge_type: input.challengeType ?? null,
      challenge_initiator_id: input.challengeInitiatorId ?? null,
      challenge_target_rank: input.challengeTargetRank ?? null,
    });

    const setsInMatch = input.winnerSets + input.loserSets;

    await txGroups.updateGroupElo(
      input.group.id,
      input.winner.id,
      eloResult.winnerNewRating,
      true,
      winnerStreak.currentStreak,
      winnerStreak.bestStreak,
      setsInMatch,
    );

    await txGroups.updateGroupElo(
      input.group.id,
      input.loser.id,
      eloResult.loserNewRating,
      false,
      loserStreak.currentStreak,
      loserStreak.bestStreak,
      setsInMatch,
    );

    // Evaluate and persist achievements
    if (achievementsEnabled) {
      const [
        winnerExisting,
        loserExisting,
        matchCount,
        winnerRankAfterData,
        loserRankAfterData,
        consecutiveWins,
        recentH2HWinnerIds,
        winnerHistoryRows,
        loserHistoryRows,
        activeOpponentIds,
      ] = await Promise.all([
        txAchievements.getPlayerAchievementIds(input.winner.id, input.group.id),
        txAchievements.getPlayerAchievementIds(input.loser.id, input.group.id),
        txMatches.countMatchesBetween(input.winner.id, input.loser.id, input.group.id),
        txMatches.getPlayerStats(input.winner.id, input.group.id),
        txMatches.getPlayerStats(input.loser.id, input.group.id),
        txMatches.getConsecutiveWinsAgainst(input.winner.id, input.loser.id, input.group.id),
        txMatches.getH2HWinnerIds(input.winner.id, input.loser.id, input.group.id),
        txMatches.getPlayerRecentMatches(input.winner.id, input.group.id, 10000),
        txMatches.getPlayerRecentMatches(input.loser.id, input.group.id, 10000),
        txGroups.getActivePlayerIds(input.group.id, "singles", match.played_at),
      ]);

      await txSql`
        UPDATE matches SET
          winner_rank_after = ${winnerRankAfterData?.rank ?? null},
          loser_rank_after = ${loserRankAfterData?.rank ?? null}
        WHERE id = ${match.id}
      `;

      const toHistory = (playerId: string, rows: typeof winnerHistoryRows) => rows.map((row) => {
        const won = row.winner_id === playerId || row.winner_partner_id === playerId;
        const partnerId = row.match_type === "doubles"
          ? row.winner_id === playerId ? row.winner_partner_id
            : row.winner_partner_id === playerId ? row.winner_id
              : row.loser_id === playerId ? row.loser_partner_id : row.loser_id
          : null;
        const opponents = row.match_type === "doubles"
          ? won ? [row.loser_id, row.loser_partner_id] : [row.winner_id, row.winner_partner_id]
          : [row.winner_id === playerId ? row.loser_id : row.winner_id];
        return {
          playedAt: row.played_at,
          matchType: row.match_type,
          won: !(
            row.match_type === "tournament" && row.winner_score === row.loser_score
          ) && won,
          draw: row.match_type === "tournament" && row.winner_score === row.loser_score,
          opponentIds: [...(partnerId ? [partnerId] : []), ...opponents.filter((id): id is string => Boolean(id))],
          playerEloBefore: row.winner_id === playerId ? row.elo_before_winner : row.elo_before_loser,
          opponentEloBefore: row.winner_id === playerId ? row.elo_before_loser : row.elo_before_winner,
        };
      });

      const matchAchievements = evaluateAchievements({
        matchType: "singles",
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
        winnerRank: winnerRankAfterData?.rank ?? null,
        winnerExistingAchievements: winnerExisting,
        loserExistingAchievements: loserExisting,
        loserStreak: loserStreak.currentStreak,
        loserConsecutiveLossesVsWinner: consecutiveWins,
        playedAt: match.played_at,
        eloChange: eloResult.change,
        winnerRankBefore: winnerRankBeforeData?.rank ?? null,
        loserRankBefore: loserRankBeforeData?.rank ?? null,
        winnerRankAfter: winnerRankAfterData?.rank ?? null,
        challengeType: input.challengeType ?? null,
        challengeInitiatorId: input.challengeInitiatorId ?? null,
        challengeTargetRank: input.challengeTargetRank ?? null,
        recentH2HWinnerIds,
        winnerConsecutiveLossesVsLoserBefore: lossesVsLoserBefore,
        winnerTopTwoDefenceStreak: await txMatches.getTopTwoDefenceStreak(input.winner.id, input.group.id),
      });

      const historicalAchievements = [
        ...evaluatePlayerHistoryAchievements({
          playerId: input.winner.id,
          matches: toHistory(input.winner.id, winnerHistoryRows),
          activeOpponentIds,
          existingAchievements: winnerExisting,
        }),
        ...evaluatePlayerHistoryAchievements({
          playerId: input.loser.id,
          matches: toHistory(input.loser.id, loserHistoryRows),
          activeOpponentIds,
          existingAchievements: loserExisting,
        }),
      ];

      const candidates = [...matchAchievements, ...historicalAchievements].filter(
        (achievement, index, all) => all.findIndex((item) =>
          item.playerId === achievement.playerId && item.achievementId === achievement.achievementId
        ) === index,
      );

      newAchievements = await txAchievements.awardWithMeta(
        input.group.id,
        candidates,
        { type: "match", id: match.id },
        match.played_at,
      );
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
