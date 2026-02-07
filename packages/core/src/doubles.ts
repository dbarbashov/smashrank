import { getKFactor, expectedScore } from "./elo.js";

const ELO_FLOOR = 100;

export interface DoublesEloInput {
  winner1Rating: number;
  winner2Rating: number;
  loser1Rating: number;
  loser2Rating: number;
  winner1GamesPlayed: number;
  winner2GamesPlayed: number;
  loser1GamesPlayed: number;
  loser2GamesPlayed: number;
}

export interface DoublesEloResult {
  winner1NewRating: number;
  winner2NewRating: number;
  loser1NewRating: number;
  loser2NewRating: number;
  change: number;
}

export function calculateDoublesElo(input: DoublesEloInput): DoublesEloResult {
  const winnerAvg = (input.winner1Rating + input.winner2Rating) / 2;
  const loserAvg = (input.loser1Rating + input.loser2Rating) / 2;

  // Use minimum K-factor of both partners
  const winnerK = Math.min(
    getKFactor(input.winner1GamesPlayed),
    getKFactor(input.winner2GamesPlayed),
  );
  const loserK = Math.min(
    getKFactor(input.loser1GamesPlayed),
    getKFactor(input.loser2GamesPlayed),
  );

  const winnerExpected = expectedScore(winnerAvg, loserAvg);
  const loserExpected = expectedScore(loserAvg, winnerAvg);

  const winnerChange = Math.round(winnerK * (1 - winnerExpected));
  const loserChange = Math.round(loserK * (0 - loserExpected));

  return {
    winner1NewRating: Math.max(ELO_FLOOR, input.winner1Rating + winnerChange),
    winner2NewRating: Math.max(ELO_FLOOR, input.winner2Rating + winnerChange),
    loser1NewRating: Math.max(ELO_FLOOR, input.loser1Rating + loserChange),
    loser2NewRating: Math.max(ELO_FLOOR, input.loser2Rating + loserChange),
    change: winnerChange,
  };
}
