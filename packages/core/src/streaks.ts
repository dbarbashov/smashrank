export interface StreakResult {
  currentStreak: number;
  bestStreak: number;
}

export function updateStreak(
  currentStreak: number,
  bestStreak: number,
  won: boolean,
): StreakResult {
  let newStreak: number;
  if (won) {
    newStreak = currentStreak > 0 ? currentStreak + 1 : 1;
  } else {
    newStreak = currentStreak < 0 ? currentStreak - 1 : -1;
  }
  const newBest = Math.max(bestStreak, newStreak);
  return { currentStreak: newStreak, bestStreak: newBest };
}
