export function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0)
    return <span className="text-sm text-gray-400 dark:text-gray-600">-</span>;

  if (streak > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-md bg-green-100 px-1.5 py-0.5 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
        title={`${streak}W streak`}
      >
        {streak >= 5 ? "\u{1F525}" : "\u25B2"} {streak}
      </span>
    );
  }

  const abs = Math.abs(streak);
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
      title={`${abs}L streak`}
    >
      {abs >= 5 ? "\u{1F9CA}" : "\u25BC"} {abs}
    </span>
  );
}
