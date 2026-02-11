import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { useH2H } from "../api/queries.js";
import { Avatar } from "../components/avatar.js";
import { H2HBar } from "../components/h2h-bar.js";
import { EloBadge } from "../components/elo-badge.js";
import { MatchCard } from "../components/match-card.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";

export function H2HPage() {
  const { slug, id, otherId } = useParams<{
    slug: string;
    id: string;
    otherId: string;
  }>();
  const { t } = useTranslation();

  const { data, isLoading, error } = useH2H(slug!, id!, otherId!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!data) return null;

  const { playerA, playerB, winsA, winsB, totalMatches, recent, eloHistoryA, eloHistoryB, currentStreak } = data;

  // Build dual ELO chart data
  const allDates = new Map<string, { eloA?: number; eloB?: number }>();
  for (const e of eloHistoryA) {
    const key = e.played_at;
    const existing = allDates.get(key) ?? {};
    existing.eloA = e.elo_after;
    allDates.set(key, existing);
  }
  for (const e of eloHistoryB) {
    const key = e.played_at;
    const existing = allDates.get(key) ?? {};
    existing.eloB = e.elo_after;
    allDates.set(key, existing);
  }

  const sortedKeys = [...allDates.keys()].sort();
  let lastA = 1200;
  let lastB = 1200;
  const chartData = sortedKeys.map((key) => {
    const entry = allDates.get(key)!;
    if (entry.eloA !== undefined) lastA = entry.eloA;
    if (entry.eloB !== undefined) lastB = entry.eloB;
    return {
      date: new Date(key).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      [playerA?.display_name ?? "Player A"]: lastA,
      [playerB?.display_name ?? "Player B"]: lastB,
    };
  });

  const nameA = playerA?.display_name ?? "Player A";
  const nameB = playerB?.display_name ?? "Player B";

  return (
    <div className="space-y-6">
      {/* Header with avatars */}
      <div className="flex items-center justify-center gap-8 py-2">
        <div className="flex flex-col items-center gap-1.5">
          {playerA && <Avatar playerId={playerA.id} name={nameA} size="lg" />}
          <span className="font-semibold">{nameA}</span>
          {playerA && <EloBadge elo={playerA.elo_rating} />}
        </div>
        <span className="text-3xl font-bold text-slate-300 dark:text-slate-600">vs</span>
        <div className="flex flex-col items-center gap-1.5">
          {playerB && <Avatar playerId={playerB.id} name={nameB} size="lg" />}
          <span className="font-semibold">{nameB}</span>
          {playerB && <EloBadge elo={playerB.elo_rating} />}
        </div>
      </div>

      {/* Record summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
        <div className="text-2xl font-bold tabular-nums">
          {winsA} - {winsB}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {t("h2h.totalMatches", { count: totalMatches })}
        </div>
        {currentStreak && currentStreak.count > 1 && (
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("h2h.currentStreak", {
              name: currentStreak.playerId === id ? nameA : nameB,
              count: currentStreak.count,
            })}
          </div>
        )}
      </div>

      {/* Win distribution bar */}
      {totalMatches > 0 && (
        <H2HBar winsA={winsA} winsB={winsB} nameA={nameA} nameB={nameB} />
      )}

      {/* Dual ELO chart */}
      {chartData.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h3 className="mb-3 font-semibold">{t("h2h.eloComparison")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey={nameA}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey={nameB}
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent matches */}
      {recent.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">{t("h2h.recentMatches")}</h3>
          <div className="flex flex-col gap-2">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} perspectivePlayerId={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
