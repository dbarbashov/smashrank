import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTournamentDetail, useMatches } from "../api/queries.js";
import { MatchCard } from "../components/match-card.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import type { TournamentDetail as TournamentDetailType, TournamentFixture } from "../types.js";

function Tip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="group relative cursor-help">
      {label}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-200 dark:text-slate-900">
        {tip}
      </span>
    </span>
  );
}

function FixtureMatrix({ tournament }: { tournament: TournamentDetailType }) {
  const { t } = useTranslation();
  const players = tournament.standings.length > 0
    ? tournament.standings.map((s) => ({ id: s.player_id, name: s.display_name }))
    : tournament.participants.map((p) => ({ id: p.player_id, name: p.display_name }));

  // Build fixture lookup
  const fixtureMap = new Map<string, TournamentFixture>();
  for (const f of tournament.fixtures) {
    fixtureMap.set(`${f.player1_id}:${f.player2_id}`, f);
    fixtureMap.set(`${f.player2_id}:${f.player1_id}`, f);
  }

  function getCellContent(rowId: string, colId: string): string {
    if (rowId === colId) return "-";
    const fixture = fixtureMap.get(`${rowId}:${colId}`);
    if (!fixture || !fixture.played) return "";

    if (fixture.is_draw) return `=${fixture.winner_score}-${fixture.loser_score}`;

    if (fixture.winner_id === rowId) {
      return `W ${fixture.winner_score}-${fixture.loser_score}`;
    } else {
      return `L ${fixture.loser_score}-${fixture.winner_score}`;
    }
  }

  function getCellColor(rowId: string, colId: string): string {
    if (rowId === colId) return "bg-slate-100 dark:bg-slate-800";
    const fixture = fixtureMap.get(`${rowId}:${colId}`);
    if (!fixture || !fixture.played) return "";

    if (fixture.is_draw) return "bg-amber-50 dark:bg-amber-900/20";
    if (fixture.winner_id === rowId) return "bg-emerald-50 dark:bg-emerald-900/20";
    return "bg-red-50 dark:bg-red-900/20";
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
      <h3 className="px-4 pt-4 font-semibold">{t("tournaments.fixtureMatrix")}</h3>
      <div className="p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left"></th>
              {players.map((p) => (
                <th key={p.id} className="px-2 py-1.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                  {p.name.slice(0, 8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-2 py-1.5 font-medium">{row.name}</td>
                {players.map((col) => (
                  <td
                    key={col.id}
                    className={`rounded px-2 py-1.5 text-center text-xs ${getCellColor(row.id, col.id)}`}
                  >
                    {getCellContent(row.id, col.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TournamentDetailPage() {
  const { slug, tournamentId } = useParams<{ slug: string; tournamentId: string }>();
  const { t } = useTranslation();
  const { data: tournament, isLoading, error } = useTournamentDetail(slug!, tournamentId!);
  const {
    data: matchPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMatches(slug!, { tournament: tournamentId });

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!tournament) return <ErrorMessage message="Tournament not found" />;

  const matches = matchPages?.pages.flat() ?? [];

  const statusColors: Record<string, string> = {
    open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    completed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };

  return (
    <div className="space-y-6">
      <Link
        to={`/g/${slug}/tournaments`}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" clipRule="evenodd" />
        </svg>
        {t("tournaments.backToList")}
      </Link>

      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{tournament.name}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            statusColors[tournament.status] ?? statusColors.completed
          }`}
        >
          {t(`tournaments.status_${tournament.status}`)}
        </span>
      </div>

      {tournament.standings.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h3 className="px-4 pt-4 font-semibold">{t("tournaments.standings")}</h3>
          <div className="overflow-x-auto p-4" style={{ overflow: "visible" }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">{t("leaderboard.player")}</th>
                  <th className="px-2 py-2 text-center"><Tip label={t("tournaments.col_played")} tip={t("tournaments.col_played_tip")} /></th>
                  <th className="px-2 py-2 text-center"><Tip label={t("tournaments.col_wins")} tip={t("tournaments.col_wins_tip")} /></th>
                  <th className="px-2 py-2 text-center"><Tip label={t("tournaments.col_draws")} tip={t("tournaments.col_draws_tip")} /></th>
                  <th className="px-2 py-2 text-center"><Tip label={t("tournaments.col_losses")} tip={t("tournaments.col_losses_tip")} /></th>
                  <th className="px-2 py-2 text-center"><Tip label={t("tournaments.col_sd")} tip={t("tournaments.col_sd_tip")} /></th>
                  <th className="px-2 py-2 text-center font-bold"><Tip label={t("tournaments.col_pts")} tip={t("tournaments.col_pts_tip")} /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {tournament.standings.map((s) => (
                  <tr
                    key={s.player_id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-2 py-2 font-medium text-slate-400 dark:text-slate-500">{s.rank}</td>
                    <td className="px-2 py-2">
                      <Link
                        to={`/g/${slug}/player/${s.player_id}`}
                        className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {s.display_name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.wins + s.draws + s.losses}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.wins}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.draws}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{s.losses}</td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {s.set_diff >= 0 ? `+${s.set_diff}` : s.set_diff}
                    </td>
                    <td className="px-2 py-2 text-center font-bold tabular-nums">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tournament.fixtures.length > 0 && <FixtureMatrix tournament={tournament} />}

      {tournament.status === "open" && tournament.participants.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h3 className="mb-2 font-semibold">{t("tournaments.participants")}</h3>
          <ul className="list-inside list-decimal text-slate-600 dark:text-slate-300">
            {tournament.participants.map((p) => (
              <li key={p.player_id}>{p.display_name}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
          {t("tournaments.rules")}
        </summary>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>{t("tournaments.rules_format")}</li>
          <li>{t("tournaments.rules_players")}</li>
          <li>{t("tournaments.rules_scoring")}</li>
          <li>{t("tournaments.rules_tiebreakers")}</li>
          <li>{t("tournaments.rules_stale")}</li>
        </ul>
      </details>

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
