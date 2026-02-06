const ELO_FLOOR = 100;

export function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed <= 30) return 24;
  return 16;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface EloInput {
  winnerRating: number;
  loserRating: number;
  winnerGamesPlayed: number;
  loserGamesPlayed: number;
}

export interface EloResult {
  winnerNewRating: number;
  loserNewRating: number;
  change: number;
}

export function calculateElo(input: EloInput): EloResult {
  const winnerK = getKFactor(input.winnerGamesPlayed);
  const loserK = getKFactor(input.loserGamesPlayed);

  const winnerExpected = expectedScore(input.winnerRating, input.loserRating);
  const loserExpected = expectedScore(input.loserRating, input.winnerRating);

  const winnerNewRaw = input.winnerRating + winnerK * (1 - winnerExpected);
  const loserNewRaw = input.loserRating + loserK * (0 - loserExpected);

  const winnerNewRating = Math.max(ELO_FLOOR, Math.round(winnerNewRaw));
  const loserNewRating = Math.max(ELO_FLOOR, Math.round(loserNewRaw));

  const change = winnerNewRating - input.winnerRating;

  return { winnerNewRating, loserNewRating, change };
}
