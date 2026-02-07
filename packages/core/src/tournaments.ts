export interface Standing {
  playerId: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  eloRating: number;
}

export interface Fixture {
  player1Id: string;
  player2Id: string;
}

/**
 * Generate all round-robin fixtures (every pair plays once).
 */
export function generateFixtures(playerIds: string[]): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      fixtures.push({ player1Id: playerIds[i], player2Id: playerIds[j] });
    }
  }
  return fixtures;
}

/**
 * Sort standings by: Points → H2H → Set difference → ELO (descending).
 * H2H is provided as a map of "playerA:playerB" → "playerA" | "playerB" | "draw".
 */
export function sortStandings(
  standings: Standing[],
  h2h: Map<string, string | null>,
): Standing[] {
  return [...standings].sort((a, b) => {
    // 1. Points (desc)
    if (b.points !== a.points) return b.points - a.points;

    // 2. Head-to-head
    const key = a.playerId < b.playerId
      ? `${a.playerId}:${b.playerId}`
      : `${b.playerId}:${a.playerId}`;
    const h2hWinner = h2h.get(key);
    if (h2hWinner === a.playerId) return -1;
    if (h2hWinner === b.playerId) return 1;

    // 3. Set difference (desc)
    const aDiff = a.setsWon - a.setsLost;
    const bDiff = b.setsWon - b.setsLost;
    if (bDiff !== aDiff) return bDiff - aDiff;

    // 4. ELO (desc)
    return b.eloRating - a.eloRating;
  });
}
