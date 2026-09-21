import { useTranslation } from "react-i18next";

const STREAK_SYMBOLS = {
  fire: "\u{1F525}",
  up: "\u25B2",
  ice: "\u{1F9CA}",
  down: "\u25BC",
} as const;

function getStreakKind(streak: number): keyof typeof STREAK_SYMBOLS {
  if (streak >= 5) return "fire";
  if (streak > 0) return "up";
  if (streak <= -5) return "ice";
  return "down";
}

export function StreakBadge({ streak }: { streak: number }) {
  const { t } = useTranslation();

  if (streak === 0)
    return <span className="text-sm text-gray-400 dark:text-gray-600">-</span>;

  const isWinning = streak > 0;
  const count = Math.abs(streak);
  const kind = getStreakKind(streak);
  const label = t(
    isWinning
      ? "leaderboard.winningStreak"
      : "leaderboard.losingStreak",
    { count },
  );
  const style = isWinning
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";

  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-sm font-medium ${style}`}
      aria-label={label}
      title={label}
    >
      <span
        className={`badge-motion-icon streak-icon streak-icon-${kind}`}
        aria-hidden="true"
      >
        {STREAK_SYMBOLS[kind]}
      </span>{" "}
      {count}
    </span>
  );
}
