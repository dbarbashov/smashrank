import type postgres from "postgres";
import {
  getConnection,
  matchQueries,
  tournamentQueries,
  groupQueries,
  achievementQueries,
} from "@smashrank/db";
import type { Player, Group, GroupMember, Match, Tournament } from "@smashrank/db";
import {
  calculateElo,
  calculateDrawElo,
  evaluateAchievements,
  evaluatePlayerHistoryAchievements,
  evaluateDrawScoreAchievements,
  ACHIEVEMENT_BY_ID,
} from "@smashrank/core";
import type { EloResult, DrawEloResult, AchievementUnlock } from "@smashrank/core";
import { ensureActiveSeason } from "./ensure-season.js";

function withoutDoublesAchievements(unlocks: AchievementUnlock[]): AchievementUnlock[] {
  return unlocks.filter((unlock) =>
    ACHIEVEMENT_BY_ID.get(unlock.achievementId)?.category !== "doubles"
  );
}

export interface RecordTournamentMatchInput {
  group: Group;
  tournament: Tournament;
  reporter: Player;
  opponent: Player;
  /** Reporter's sets won */
  reporterSets: number;
  /** Opponent's sets won */
  opponentSets: number;
  isDraw: boolean;
  /** Set scores from reporter's perspective: { reporterScore, opponentScore } */
  setScores: { reporterScore: number; opponentScore: number }[] | null;
}

export interface RecordTournamentMatchResult {
  match: Match;
  isDraw: boolean;
  eloChange: number;
  reporterNewElo: number;
  opponentNewElo: number;
  remainingFixtures: number;
  tournamentComplete: boolean;
  newAchievements: AchievementUnlock[];
}

export async function recordTournamentMatch(
  input: RecordTournamentMatchInput,
): Promise<RecordTournamentMatchResult> {
  const sql = getConnection();
  const groups = groupQueries(sql);
  const season = await ensureActiveSeason(input.group.id);

  // Get group member stats for ELO
  const [reporterMember, opponentMember] = await Promise.all([
    groups.getGroupMember(input.group.id, input.reporter.id),
    groups.getGroupMember(input.group.id, input.opponent.id),
  ]) as [GroupMember, GroupMember];

  let match!: Match;
  let reporterNewElo!: number;
  let opponentNewElo!: number;
  let eloChange!: number;
  let remainingFixtures!: number;
  let tournamentComplete = false;
  let newAchievements: AchievementUnlock[] = [];
  const [reporterRankBefore, opponentRankBefore] = await Promise.all([
    matchQueries(sql).getPlayerStats(input.reporter.id, input.group.id),
    matchQueries(sql).getPlayerStats(input.opponent.id, input.group.id),
  ]);

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txMatches = matchQueries(txSql);
    const txTournaments = tournamentQueries(txSql);
    const txGroups = groupQueries(txSql);

    if (input.isDraw) {
      // Draw: reporter stored as winner_id, opponent as loser_id, equal scores
      const drawResult: DrawEloResult = calculateDrawElo({
        playerARating: reporterMember.elo_rating,
        playerBRating: opponentMember.elo_rating,
        playerAGamesPlayed: reporterMember.games_played,
        playerBGamesPlayed: opponentMember.games_played,
      });

      reporterNewElo = drawResult.playerANewRating;
      opponentNewElo = drawResult.playerBNewRating;
      eloChange = drawResult.playerAChange;

      // Orient set scores to { w, l } — for draws, reporter's scores first
      const orientedSetScores = input.setScores
        ? input.setScores.map((s) => ({ w: s.reporterScore, l: s.opponentScore }))
        : null;

      match = await txMatches.create({
        match_type: "tournament",
        season_id: season.id,
        group_id: input.group.id,
        winner_id: input.reporter.id,
        loser_id: input.opponent.id,
        winner_score: input.reporterSets,
        loser_score: input.opponentSets,
        set_scores: orientedSetScores,
        elo_before_winner: reporterMember.elo_rating,
        elo_before_loser: opponentMember.elo_rating,
        elo_change: eloChange,
        reported_by: input.reporter.id,
        tournament_id: input.tournament.id,
        winner_rank_before: reporterRankBefore?.rank ?? null,
        loser_rank_before: opponentRankBefore?.rank ?? null,
      });

      const setsInMatch = input.reporterSets + input.opponentSets;
      await txGroups.updateGroupEloForDraw(input.group.id, input.reporter.id, reporterNewElo, setsInMatch);
      await txGroups.updateGroupEloForDraw(input.group.id, input.opponent.id, opponentNewElo, setsInMatch);
      const [reporterRankAfter, opponentRankAfter] = await Promise.all([
        txMatches.getPlayerStats(input.reporter.id, input.group.id),
        txMatches.getPlayerStats(input.opponent.id, input.group.id),
      ]);
      await txSql`
        UPDATE matches SET
          winner_rank_after = ${reporterRankAfter?.rank ?? null},
          loser_rank_after = ${opponentRankAfter?.rank ?? null}
        WHERE id = ${match.id}
      `;

      // Update standings
      await txTournaments.updateStanding(
        input.tournament.id, input.reporter.id, "draw",
        input.reporterSets, input.opponentSets,
      );
      await txTournaments.updateStanding(
        input.tournament.id, input.opponent.id, "draw",
        input.opponentSets, input.reporterSets,
      );
      if (input.group.settings?.achievements !== false) {
        const txAchievements = achievementQueries(txSql);
        const [reporterExisting, opponentExisting, reporterHistory, opponentHistory, activeOpponentIds] = await Promise.all([
          txAchievements.getPlayerAchievementIds(input.reporter.id, input.group.id),
          txAchievements.getPlayerAchievementIds(input.opponent.id, input.group.id),
          txMatches.getPlayerRecentMatches(input.reporter.id, input.group.id, 10000),
          txMatches.getPlayerRecentMatches(input.opponent.id, input.group.id, 10000),
          txGroups.getActivePlayerIds(input.group.id, "singles", match.played_at),
        ]);
        const toHistory = (playerId: string, rows: typeof reporterHistory) => rows.map((row) => ({
          playedAt: row.played_at,
          matchType: row.match_type,
          won: row.winner_score !== row.loser_score && row.winner_id === playerId,
          draw: row.winner_score === row.loser_score,
          opponentIds: [row.winner_id === playerId ? row.loser_id : row.winner_id],
          playerEloBefore: row.winner_id === playerId ? row.elo_before_winner : row.elo_before_loser,
          opponentEloBefore: row.winner_id === playerId ? row.elo_before_loser : row.elo_before_winner,
        }));
        const existing = new Map([
          [input.reporter.id, reporterExisting],
          [input.opponent.id, opponentExisting],
        ]);
        const candidates = [
          ...evaluateDrawScoreAchievements(input.reporter.id, input.opponent.id, orientedSetScores, existing),
          ...withoutDoublesAchievements(evaluatePlayerHistoryAchievements({
            playerId: input.reporter.id,
            matches: toHistory(input.reporter.id, reporterHistory),
            activeOpponentIds,
            existingAchievements: reporterExisting,
          })),
          ...withoutDoublesAchievements(evaluatePlayerHistoryAchievements({
            playerId: input.opponent.id,
            matches: toHistory(input.opponent.id, opponentHistory),
            activeOpponentIds,
            existingAchievements: opponentExisting,
          })),
        ];
        newAchievements = await txAchievements.awardWithMeta(
          input.group.id,
          candidates.filter((candidate, index, all) => all.findIndex((item) =>
            item.playerId === candidate.playerId && item.achievementId === candidate.achievementId
          ) === index),
          { type: "match", id: match.id },
          match.played_at,
        );
      }
    } else {
      // Win/loss — determine winner/loser by sets
      const reporterIsWinner = input.reporterSets > input.opponentSets;
      const winnerId = reporterIsWinner ? input.reporter.id : input.opponent.id;
      const loserId = reporterIsWinner ? input.opponent.id : input.reporter.id;
      const winnerMember = reporterIsWinner ? reporterMember : opponentMember;
      const loserMember = reporterIsWinner ? opponentMember : reporterMember;
      const winnerSets = Math.max(input.reporterSets, input.opponentSets);
      const loserSets = Math.min(input.reporterSets, input.opponentSets);

      const eloResult: EloResult = calculateElo({
        winnerRating: winnerMember.elo_rating,
        loserRating: loserMember.elo_rating,
        winnerGamesPlayed: winnerMember.games_played,
        loserGamesPlayed: loserMember.games_played,
      });

      reporterNewElo = reporterIsWinner
        ? eloResult.winnerNewRating : eloResult.loserNewRating;
      opponentNewElo = !reporterIsWinner
        ? eloResult.winnerNewRating : eloResult.loserNewRating;
      eloChange = eloResult.change;

      // Orient set scores: winner's score first
      const orientedSetScores = input.setScores
        ? input.setScores.map((s) => {
            return {
              w: reporterIsWinner ? s.reporterScore : s.opponentScore,
              l: reporterIsWinner ? s.opponentScore : s.reporterScore,
            };
          })
        : null;

      match = await txMatches.create({
        match_type: "tournament",
        season_id: season.id,
        group_id: input.group.id,
        winner_id: winnerId,
        loser_id: loserId,
        winner_score: winnerSets,
        loser_score: loserSets,
        set_scores: orientedSetScores,
        elo_before_winner: winnerMember.elo_rating,
        elo_before_loser: loserMember.elo_rating,
        elo_change: eloResult.change,
        reported_by: input.reporter.id,
        tournament_id: input.tournament.id,
        winner_rank_before: reporterIsWinner ? reporterRankBefore?.rank : opponentRankBefore?.rank,
        loser_rank_before: reporterIsWinner ? opponentRankBefore?.rank : reporterRankBefore?.rank,
      });

      const setsInMatch = winnerSets + loserSets;
      await txGroups.updateGroupElo(
        input.group.id, winnerId, eloResult.winnerNewRating, true,
        winnerMember.current_streak > 0 ? winnerMember.current_streak + 1 : 1,
        Math.max(winnerMember.best_streak, winnerMember.current_streak > 0 ? winnerMember.current_streak + 1 : 1),
        setsInMatch,
      );
      await txGroups.updateGroupElo(
        input.group.id, loserId, eloResult.loserNewRating, false,
        loserMember.current_streak < 0 ? loserMember.current_streak - 1 : -1,
        loserMember.best_streak,
        setsInMatch,
      );

      const achievementsEnabled = input.group.settings?.achievements !== false;
      if (achievementsEnabled) {
        const txAchievements = achievementQueries(txSql);
        const [winnerExisting, loserExisting, matchCount, winnerRankAfter, loserRankAfter, consecutiveWins, recentH2H, winnerHistoryRows, loserHistoryRows, activeOpponentIds] = await Promise.all([
          txAchievements.getPlayerAchievementIds(winnerId, input.group.id),
          txAchievements.getPlayerAchievementIds(loserId, input.group.id),
          txMatches.countMatchesBetween(winnerId, loserId, input.group.id),
          txMatches.getPlayerStats(winnerId, input.group.id),
          txMatches.getPlayerStats(loserId, input.group.id),
          txMatches.getConsecutiveWinsAgainst(winnerId, loserId, input.group.id),
          txMatches.getH2HWinnerIds(winnerId, loserId, input.group.id),
          txMatches.getPlayerRecentMatches(winnerId, input.group.id, 10000),
          txMatches.getPlayerRecentMatches(loserId, input.group.id, 10000),
          txGroups.getActivePlayerIds(input.group.id, "singles", match.played_at),
        ]);
        await txSql`
          UPDATE matches SET
            winner_rank_after = ${winnerRankAfter?.rank ?? null},
            loser_rank_after = ${loserRankAfter?.rank ?? null}
          WHERE id = ${match.id}
        `;
        const candidates = evaluateAchievements({
          matchType: "tournament",
          winnerId,
          loserId,
          winnerStreak: winnerMember.current_streak > 0 ? winnerMember.current_streak + 1 : 1,
          winnerStreakBefore: winnerMember.current_streak,
          winnerElo: winnerMember.elo_rating,
          loserElo: loserMember.elo_rating,
          winnerGamesPlayed: winnerMember.games_played + 1,
          loserGamesPlayed: loserMember.games_played + 1,
          winnerWins: winnerMember.wins + 1,
          setScores: orientedSetScores,
          matchesBetween: matchCount,
          winnerRank: winnerRankAfter?.rank ?? null,
          winnerExistingAchievements: winnerExisting,
          loserExistingAchievements: loserExisting,
          loserStreak: loserMember.current_streak < 0 ? loserMember.current_streak - 1 : -1,
          loserConsecutiveLossesVsWinner: consecutiveWins,
          playedAt: match.played_at,
          eloChange: eloResult.change,
          winnerRankBefore: reporterIsWinner ? reporterRankBefore?.rank : opponentRankBefore?.rank,
          loserRankBefore: reporterIsWinner ? opponentRankBefore?.rank : reporterRankBefore?.rank,
          winnerRankAfter: winnerRankAfter?.rank ?? null,
          recentH2HWinnerIds: recentH2H,
        });
        const toHistory = (playerId: string, rows: typeof winnerHistoryRows) => rows.map((row) => ({
          playedAt: row.played_at,
          matchType: row.match_type,
          won: row.winner_score !== row.loser_score && row.winner_id === playerId,
          draw: row.match_type === "tournament" && row.winner_score === row.loser_score,
          opponentIds: [row.winner_id === playerId ? row.loser_id : row.winner_id],
          playerEloBefore: row.winner_id === playerId ? row.elo_before_winner : row.elo_before_loser,
          opponentEloBefore: row.winner_id === playerId ? row.elo_before_loser : row.elo_before_winner,
        }));
        candidates.push(
          ...withoutDoublesAchievements(evaluatePlayerHistoryAchievements({
            playerId: winnerId,
            matches: toHistory(winnerId, winnerHistoryRows),
            activeOpponentIds,
            existingAchievements: winnerExisting,
          })),
          ...withoutDoublesAchievements(evaluatePlayerHistoryAchievements({
            playerId: loserId,
            matches: toHistory(loserId, loserHistoryRows),
            activeOpponentIds,
            existingAchievements: loserExisting,
          })),
        );
        newAchievements = await txAchievements.awardWithMeta(
          input.group.id,
          candidates.filter((candidate, index, all) => all.findIndex((item) =>
            item.playerId === candidate.playerId && item.achievementId === candidate.achievementId
          ) === index),
          { type: "match", id: match.id },
          match.played_at,
        );
      }
      // Update standings
      await txTournaments.updateStanding(
        input.tournament.id, winnerId, "win", winnerSets, loserSets,
      );
      await txTournaments.updateStanding(
        input.tournament.id, loserId, "loss", loserSets, winnerSets,
      );
    }

    // Check if tournament is complete
    remainingFixtures = await txTournaments.getUnplayedCount(input.tournament.id);
    if (remainingFixtures === 0) {
      await txTournaments.updateStatus(input.tournament.id, "completed");
      tournamentComplete = true;
    }
  });

  return {
    match: match!,
    isDraw: input.isDraw,
    eloChange,
    reporterNewElo: reporterNewElo!,
    opponentNewElo: opponentNewElo!,
    remainingFixtures: remainingFixtures!,
    tournamentComplete,
    newAchievements,
  };
}
