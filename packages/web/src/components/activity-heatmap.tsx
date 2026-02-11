import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityEntry } from "../api/queries.js";

const CELL = 12;
const GAP = 2;
const SIZE = CELL + GAP;
const WEEKS = 12;
const DAYS = 7;

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GitHub-style green palette
function getColor(count: number, dark: boolean): string {
  if (count === 0) return dark ? "#161b22" : "#ebedf0";
  if (count === 1) return dark ? "#0e4429" : "#9be9a8";
  if (count <= 3) return dark ? "#006d32" : "#40c463";
  if (count <= 5) return dark ? "#26a641" : "#30a14e";
  return dark ? "#39d353" : "#216e39";
}

export function ActivityHeatmap({
  data,
  title,
}: {
  data: ActivityEntry[] | undefined;
  title?: string;
}) {
  const { t } = useTranslation();
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const { grid, monthLabels, total } = useMemo(() => {
    const lookup = new Map<string, number>();
    let sum = 0;
    if (data) {
      for (const entry of data) {
        lookup.set(entry.date, entry.count);
        sum += entry.count;
      }
    }

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - start.getDay());

    const cells: { date: string; count: number; col: number; row: number }[] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;

    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < DAYS; d++) {
        const cellDate = new Date(start);
        cellDate.setDate(start.getDate() + w * 7 + d);
        if (cellDate > today) continue;

        const key = cellDate.toISOString().slice(0, 10);
        cells.push({ date: key, count: lookup.get(key) ?? 0, col: w, row: d });

        const m = cellDate.getMonth();
        if (m !== lastMonth && d === 0) {
          months.push({ label: MONTH_SHORT[m], col: w });
          lastMonth = m;
        }
      }
    }

    return { grid: cells, monthLabels: months, total: sum };
  }, [data]);

  const labelW = 28;
  const svgW = labelW + WEEKS * SIZE;
  const svgH = 16 + DAYS * SIZE;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title ?? t("heatmap.title")}</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {total} {total === 1 ? t("heatmap.match") : t("heatmap.matches")}
        </span>
      </div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="block w-full" style={{ maxHeight: svgH }}>
        {monthLabels.map((m) => (
          <text
            key={`m-${m.col}`}
            x={labelW + m.col * SIZE}
            y={10}
            className="fill-slate-400 dark:fill-slate-500"
            fontSize={9}
          >
            {m.label}
          </text>
        ))}
        {DAY_LABELS.map((label, i) =>
          label ? (
            <text
              key={`d-${i}`}
              x={labelW - 4}
              y={16 + i * SIZE + CELL - 2}
              textAnchor="end"
              className="fill-slate-400 dark:fill-slate-500"
              fontSize={9}
            >
              {label}
            </text>
          ) : null,
        )}
        {grid.map((cell) => (
          <rect
            key={cell.date}
            x={labelW + cell.col * SIZE}
            y={16 + cell.row * SIZE}
            width={CELL}
            height={CELL}
            rx={2}
            fill={getColor(cell.count, isDark)}
          >
            <title>
              {cell.date}: {cell.count}{" "}
              {cell.count === 1 ? t("heatmap.match") : t("heatmap.matches")}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
