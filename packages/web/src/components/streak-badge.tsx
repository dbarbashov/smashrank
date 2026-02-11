export function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-gray-400">-</span>;

  if (streak > 0) {
    return (
      <span className="text-green-500" title={`${streak}W streak`}>
        {streak >= 5 ? "\u{1F525}" : "\u25B2"} {streak}
      </span>
    );
  }

  const abs = Math.abs(streak);
  return (
    <span className="text-blue-500" title={`${abs}L streak`}>
      {abs >= 5 ? "\u{1F9CA}" : "\u25BC"} {abs}
    </span>
  );
}
