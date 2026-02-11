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
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {nameA}: {winsA}
        </span>
        <span className="font-semibold text-red-600 dark:text-red-400">
          {nameB}: {winsB}
        </span>
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {pctA > 0 && (
          <div
            className="flex items-center justify-center bg-gradient-to-r from-blue-500 to-blue-400 text-xs font-medium text-white transition-all"
            style={{ width: `${pctA}%` }}
          >
            {pctA >= 20 && `${pctA}%`}
          </div>
        )}
        {pctB > 0 && (
          <div
            className="flex items-center justify-center bg-gradient-to-r from-red-400 to-red-500 text-xs font-medium text-white transition-all"
            style={{ width: `${pctB}%` }}
          >
            {pctB >= 20 && `${pctB}%`}
          </div>
        )}
      </div>
    </div>
  );
}
