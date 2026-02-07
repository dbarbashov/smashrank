import type postgres from "postgres";
import {
  getConnection,
  matchQueries,
  tournamentQueries,
  groupQueries,
} from "@smashrank/db";
import type { Player, Group, GroupMember, Match, Tournament } from "@smashrank/db";
import {
  calculateElo,
  calculateDrawElo,
} from "@smashrank/core";
import type { EloResult, DrawEloResult } from "@smashrank/core";
import { ensureActiveSeason } from "./ensure-season.js";

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
      });

      await txGroups.updateGroupEloForDraw(input.group.id, input.reporter.id, reporterNewElo);
      await txGroups.updateGroupEloForDraw(input.group.id, input.opponent.id, opponentNewElo);

      // Update standings
      await txTournaments.updateStanding(
        input.tournament.id, input.reporter.id, "draw",
        input.reporterSets, input.opponentSets,
      );
      await txTournaments.updateStanding(
        input.tournament.id, input.opponent.id, "draw",
        input.opponentSets, input.reporterSets,
      );
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
      });

      await txGroups.updateGroupElo(
        input.group.id, winnerId, eloResult.winnerNewRating, true,
        winnerMember.current_streak > 0 ? winnerMember.current_streak + 1 : 1,
        Math.max(winnerMember.best_streak, winnerMember.current_streak > 0 ? winnerMember.current_streak + 1 : 1),
      );
      await txGroups.updateGroupElo(
        input.group.id, loserId, eloResult.loserNewRating, false,
        loserMember.current_streak < 0 ? loserMember.current_streak - 1 : -1,
        loserMember.best_streak,
      );

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
  };
}
