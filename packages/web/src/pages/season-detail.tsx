import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSeasonDetail, useMatches } from "../api/queries.js";
import { PlayerLink } from "../components/player-link.js";
import { EloBadge } from "../components/elo-badge.js";
import { MatchCard } from "../components/match-card.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";

export function SeasonDetailPage() {
  const { slug, seasonId } = useParams<{ slug: string; seasonId: string }>();
  const { t } = useTranslation();
  const [matchType, setMatchType] = useState<"singles" | "doubles">("singles");
  const { data, isLoading, error } = useSeasonDetail(
    slug!,
    seasonId!,
    matchType === "doubles" ? "doubles" : undefined,
  );
  const {
    data: matchPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMatches(slug!, { season: seasonId });

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!data) return null;

  const matches = matchPages?.pages.flat() ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{data.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date(data.start_date).toLocaleDateString()}
            {data.end_date
              ? ` - ${new Date(data.end_date).toLocaleDateString()}`
              : ""}
            {data.is_active && (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {t("seasons.active")}
              </span>
            )}
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          <button
            className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${matchType === "singles" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
            onClick={() => setMatchType("singles")}
          >
            {t("leaderboard.singles")}
          </button>
          <button
            className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${matchType === "doubles" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
            onClick={() => setMatchType("doubles")}
          >
            {t("leaderboard.doubles")}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
        <h3 className="px-4 pt-4 font-semibold">{t("seasons.standings")}</h3>

        {data.standings.length === 0 ? (
          <p className="p-4 text-slate-500 dark:text-slate-400">{t("leaderboard.empty")}</p>
        ) : (
          <div className="p-4">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-2">{t("leaderboard.rank")}</th>
                  <th className="py-2">{t("leaderboard.player")}</th>
                  <th className="py-2 text-right">{t("leaderboard.elo")}</th>
                  <th className="py-2 text-right">{t("leaderboard.record")}</th>
                  <th className="py-2 text-right">{t("leaderboard.winRate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data.standings.map((s) => {
                  const gp = s.games_played;
                  const winPct =
                    gp > 0 ? Math.round((s.wins / gp) * 100) : 0;
                  return (
                    <tr
                      key={s.player_id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2 pr-2 font-medium text-slate-400 dark:text-slate-500">{s.final_rank}</td>
                      <td className="py-2">
                        <PlayerLink id={s.player_id} name={s.display_name} />
                      </td>
                      <td className="py-2 text-right">
                        <EloBadge elo={s.final_elo} />
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {s.wins}-{s.losses}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{winPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {matches.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">{t("matches.title")}</h3>
          <div className="flex flex-col gap-2">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {isFetchingNextPage ? t("common.loading") : t("matches.loadMore")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
