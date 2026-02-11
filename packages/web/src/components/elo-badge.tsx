function getStyle(elo: number): string {
  if (elo >= 1400)
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (elo >= 1200)
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  if (elo >= 1000)
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

export function EloBadge({ elo }: { elo: number }) {
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums ${getStyle(elo)}`}
    >
      {elo}
    </span>
  );
}
