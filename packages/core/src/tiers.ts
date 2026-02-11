export interface RatingTier {
  id: string;
  name: string;
  emoji: string;
  minElo: number;
}

const TIERS: RatingTier[] = [
  { id: "diamond", name: "Diamond", emoji: "\u{1F451}", minElo: 1500 },
  { id: "platinum", name: "Platinum", emoji: "\u{1F48E}", minElo: 1300 },
  { id: "gold", name: "Gold", emoji: "\u{1F947}", minElo: 1100 },
  { id: "silver", name: "Silver", emoji: "\u{1F948}", minElo: 900 },
  { id: "bronze", name: "Bronze", emoji: "\u{1F949}", minElo: 0 },
];

export function getTier(elo: number): RatingTier {
  for (const tier of TIERS) {
    if (elo >= tier.minElo) return tier;
  }
  return TIERS[TIERS.length - 1];
}

export function getTierChange(
  eloBefore: number,
  eloAfter: number,
): { promoted: boolean; demoted: boolean; tier: RatingTier } | null {
  const before = getTier(eloBefore);
  const after = getTier(eloAfter);
  if (before.id === after.id) return null;
  return {
    promoted: eloAfter > eloBefore,
    demoted: eloAfter < eloBefore,
    tier: after,
  };
}
