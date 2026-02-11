import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatches, useLeaderboard } from "../api/queries.js";
import { MatchCard } from "../components/match-card.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import type { LeaderboardEntry } from "../types.js";

export function MatchHistory() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [playerFilter, setPlayerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data: leaderboard } = useLeaderboard(slug!);
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMatches(slug!, {
    player: playerFilter || undefined,
    type: typeFilter || undefined,
  });

  const matches = data?.pages.flat() ?? [];
  const players = (leaderboard as LeaderboardEntry[]) ?? [];

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("matches.title")}</h2>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="">{t("matches.filterPlayer")}</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="">{t("matches.filterType")}</option>
          <option value="singles">{t("matches.singles")}</option>
          <option value="doubles">{t("matches.doubles")}</option>
        </select>
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message={error.message} />
      ) : matches.length === 0 ? (
        <p className="py-12 text-center text-slate-500 dark:text-slate-400">
          {t("matches.noMatches")}
        </p>
      ) : (
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
              {isFetchingNextPage
                ? t("common.loading")
                : t("matches.loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
