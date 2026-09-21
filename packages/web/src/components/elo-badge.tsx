import { getTier, type RatingTierId } from "@smashrank/core";

const TIER_STYLES: Record<RatingTierId, string> = {
  diamond:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  platinum:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  gold:
    "bg-yellow-50 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  silver:
    "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
  bronze:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

export function EloBadge({ elo }: { elo: number }) {
  const tier = getTier(elo);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums ${TIER_STYLES[tier.id]}`}
    >
      <span
        className={`badge-motion-icon elo-badge-icon elo-badge-icon-${tier.id}`}
        aria-hidden="true"
      >
        {tier.emoji}
      </span>
      {elo}
    </span>
  );
}
