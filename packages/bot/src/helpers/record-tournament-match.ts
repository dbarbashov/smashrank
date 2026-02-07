import type postgres from "postgres";
import {
  getConnection,
  playerQueries,
  matchQueries,
  tournamentQueries,
} from "@smashrank/db";
import type { Player, Group, Match, Tournament } from "@smashrank/db";
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
  const season = await ensureActiveSeason(input.group.id);

  let match!: Match;
  let reporterNewElo!: number;
  let opponentNewElo!: number;
  let eloChange!: number;
  let remainingFixtures!: number;
  let tournamentComplete = false;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    const txPlayers = playerQueries(txSql);
    const txMatches = matchQueries(txSql);
    const txTournaments = tournamentQueries(txSql);

    if (input.isDraw) {
      // Draw: reporter stored as winner_id, opponent as loser_id, equal scores
      const drawResult: DrawEloResult = calculateDrawElo({
        playerARating: input.reporter.elo_rating,
        playerBRating: input.opponent.elo_rating,
        playerAGamesPlayed: input.reporter.games_played,
        playerBGamesPlayed: input.opponent.games_played,
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
        elo_before_winner: input.reporter.elo_rating,
        elo_before_loser: input.opponent.elo_rating,
        elo_change: eloChange,
        reported_by: input.reporter.id,
        tournament_id: input.tournament.id,
      });

      await txPlayers.updateEloForDraw(input.reporter.id, reporterNewElo);
      await txPlayers.updateEloForDraw(input.opponent.id, opponentNewElo);

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
      // Win/loss
      const winner = input.reporterSets > input.opponentSets ? input.reporter : input.opponent;
      const loser = winner.id === input.reporter.id ? input.opponent : input.reporter;
      const winnerSets = Math.max(input.reporterSets, input.opponentSets);
      const loserSets = Math.min(input.reporterSets, input.opponentSets);

      const eloResult: EloResult = calculateElo({
        winnerRating: winner.elo_rating,
        loserRating: loser.elo_rating,
        winnerGamesPlayed: winner.games_played,
        loserGamesPlayed: loser.games_played,
      });

      reporterNewElo = input.reporter.id === winner.id
        ? eloResult.winnerNewRating : eloResult.loserNewRating;
      opponentNewElo = input.opponent.id === winner.id
        ? eloResult.winnerNewRating : eloResult.loserNewRating;
      eloChange = eloResult.change;

      // Orient set scores: winner's score first
      const orientedSetScores = input.setScores
        ? input.setScores.map((s) => {
            const isReporterWinner = winner.id === input.reporter.id;
            return {
              w: isReporterWinner ? s.reporterScore : s.opponentScore,
              l: isReporterWinner ? s.opponentScore : s.reporterScore,
            };
          })
        : null;

      match = await txMatches.create({
        match_type: "tournament",
        season_id: season.id,
        group_id: input.group.id,
        winner_id: winner.id,
        loser_id: loser.id,
        winner_score: winnerSets,
        loser_score: loserSets,
        set_scores: orientedSetScores,
        elo_before_winner: winner.elo_rating,
        elo_before_loser: loser.elo_rating,
        elo_change: eloResult.change,
        reported_by: input.reporter.id,
        tournament_id: input.tournament.id,
      });

      await txPlayers.updateElo(
        winner.id, eloResult.winnerNewRating, true,
        winner.current_streak > 0 ? winner.current_streak + 1 : 1,
        Math.max(winner.best_streak, winner.current_streak > 0 ? winner.current_streak + 1 : 1),
      );
      await txPlayers.updateElo(
        loser.id, eloResult.loserNewRating, false,
        loser.current_streak < 0 ? loser.current_streak - 1 : -1,
        loser.best_streak,
      );

      // Update standings
      await txTournaments.updateStanding(
        input.tournament.id, winner.id, "win", winnerSets, loserSets,
      );
      await txTournaments.updateStanding(
        input.tournament.id, loser.id, "loss", loserSets, winnerSets,
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
