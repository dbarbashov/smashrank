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

export interface DrawEloInput {
  playerARating: number;
  playerBRating: number;
  playerAGamesPlayed: number;
  playerBGamesPlayed: number;
}

export interface DrawEloResult {
  playerANewRating: number;
  playerBNewRating: number;
  playerAChange: number;
  playerBChange: number;
}

export function calculateDrawElo(input: DrawEloInput): DrawEloResult {
  const kA = getKFactor(input.playerAGamesPlayed);
  const kB = getKFactor(input.playerBGamesPlayed);

  const expectedA = expectedScore(input.playerARating, input.playerBRating);
  const expectedB = expectedScore(input.playerBRating, input.playerARating);

  const playerANewRating = Math.max(ELO_FLOOR, Math.round(input.playerARating + kA * (0.5 - expectedA)));
  const playerBNewRating = Math.max(ELO_FLOOR, Math.round(input.playerBRating + kB * (0.5 - expectedB)));

  return {
    playerANewRating,
    playerBNewRating,
    playerAChange: playerANewRating - input.playerARating,
    playerBChange: playerBNewRating - input.playerBRating,
  };
}
