export interface AchievementContext {
  winnerId: string;
  loserId: string;
  /** Winner's streak AFTER this match */
  winnerStreak: number;
  /** Winner's streak BEFORE this match */
  winnerStreakBefore: number;
  winnerElo: number;
  loserElo: number;
  /** Games played AFTER this match (already incremented) */
  winnerGamesPlayed: number;
  loserGamesPlayed: number;
  /** Wins AFTER this match (already incremented) */
  winnerWins: number;
  /** Set scores oriented as { w, l } where w = match winner's score */
  setScores: { w: number; l: number }[] | null;
  /** Number of matches between these two players (including this one) */
  matchesBetween: number;
  /** Winner's rank in the group (1-based), null if not ranked */
  winnerRank: number | null;
  /** Achievement IDs the winner already has */
  winnerExistingAchievements: string[];
  /** Achievement IDs the loser already has */
  loserExistingAchievements: string[];
}

export interface AchievementUnlock {
  achievementId: string;
  playerId: string;
}

export function evaluateAchievements(ctx: AchievementContext): AchievementUnlock[] {
  const unlocks: AchievementUnlock[] = [];
  const alreadyGranted = new Set<string>();

  function grant(achievementId: string, playerId: string): void {
    const key = `${achievementId}:${playerId}`;
    if (alreadyGranted.has(key)) return;
    const existing = playerId === ctx.winnerId
      ? ctx.winnerExistingAchievements
      : ctx.loserExistingAchievements;
    if (!existing.includes(achievementId)) {
      alreadyGranted.add(key);
      unlocks.push({ achievementId, playerId });
    }
  }

  // first_blood: Win your first match
  if (ctx.winnerWins === 1) {
    grant("first_blood", ctx.winnerId);
  }

  // on_fire: Win 5 matches in a row
  if (ctx.winnerStreak >= 5) {
    grant("on_fire", ctx.winnerId);
  }

  // unstoppable: Win 10 matches in a row
  if (ctx.winnerStreak >= 10) {
    grant("unstoppable", ctx.winnerId);
  }

  // giant_killer: Beat a player 200+ ELO above you
  if (ctx.loserElo - ctx.winnerElo >= 200) {
    grant("giant_killer", ctx.winnerId);
  }

  // iron_man: Play 50 matches
  if (ctx.winnerGamesPlayed >= 50) {
    grant("iron_man", ctx.winnerId);
  }
  if (ctx.loserGamesPlayed >= 50) {
    grant("iron_man", ctx.loserId);
  }

  // centurion: Play 100 matches
  if (ctx.winnerGamesPlayed >= 100) {
    grant("centurion", ctx.winnerId);
  }
  if (ctx.loserGamesPlayed >= 100) {
    grant("centurion", ctx.loserId);
  }

  // comeback_kid: Win a match after losing 3+ in a row
  if (ctx.winnerStreakBefore <= -3) {
    grant("comeback_kid", ctx.winnerId);
  }

  // top_dog: Reach rank #1
  if (ctx.winnerRank === 1) {
    grant("top_dog", ctx.winnerId);
  }

  // perfect_game: Win a set 11-0
  if (ctx.setScores) {
    for (const s of ctx.setScores) {
      if (s.w >= 11 && s.l === 0) {
        grant("perfect_game", ctx.winnerId);
        break;
      }
    }
  }

  // heartbreaker: Win a 3-set match after losing first set
  if (ctx.setScores && ctx.setScores.length >= 3) {
    const firstSet = ctx.setScores[0];
    if (firstSet.w < firstSet.l) {
      grant("heartbreaker", ctx.winnerId);
    }
  }

  // rivalry: Play the same opponent 10 times
  if (ctx.matchesBetween >= 10) {
    grant("rivalry", ctx.winnerId);
    grant("rivalry", ctx.loserId);
  }

  // newcomer_threat: Win 5 of your first 10 games
  if (ctx.winnerGamesPlayed <= 10 && ctx.winnerWins >= 5) {
    grant("newcomer_threat", ctx.winnerId);
  }

  return unlocks;
}
