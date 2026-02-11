interface TierInfo {
  emoji: string;
  style: string;
}

function getTierInfo(elo: number): TierInfo {
  if (elo >= 1500)
    return {
      emoji: "\u{1F451}",
      style:
        "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    };
  if (elo >= 1300)
    return {
      emoji: "\u{1F48E}",
      style:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    };
  if (elo >= 1100)
    return {
      emoji: "\u{1F947}",
      style:
        "bg-yellow-50 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
    };
  if (elo >= 900)
    return {
      emoji: "\u{1F948}",
      style:
        "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
    };
  return {
    emoji: "\u{1F949}",
    style:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };
}

export function EloBadge({ elo }: { elo: number }) {
  const { emoji, style } = getTierInfo(elo);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums ${style}`}
    >
      <span>{emoji}</span>
      {elo}
    </span>
  );
}
