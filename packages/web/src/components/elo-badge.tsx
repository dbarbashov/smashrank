function getColor(elo: number): string {
  if (elo >= 1400) return "text-yellow-600 dark:text-yellow-400";
  if (elo >= 1200) return "text-blue-600 dark:text-blue-400";
  if (elo >= 1000) return "text-green-600 dark:text-green-400";
  return "text-gray-600 dark:text-gray-400";
}

export function EloBadge({ elo }: { elo: number }) {
  return (
    <span className={`font-bold tabular-nums ${getColor(elo)}`}>{elo}</span>
  );
}
