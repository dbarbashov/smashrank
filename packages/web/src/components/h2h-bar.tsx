export function H2HBar({
  winsA,
  winsB,
  nameA,
  nameB,
}: {
  winsA: number;
  winsB: number;
  nameA: string;
  nameB: string;
}) {
  const total = winsA + winsB;
  if (total === 0) return null;

  const pctA = Math.round((winsA / total) * 100);
  const pctB = 100 - pctA;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-blue-600 dark:text-blue-400">
          {nameA}: {winsA}
        </span>
        <span className="font-medium text-red-600 dark:text-red-400">
          {nameB}: {winsB}
        </span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {pctA > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${pctA}%` }}
          />
        )}
        {pctB > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${pctB}%` }}
          />
        )}
      </div>
    </div>
  );
}
