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
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs font-normal text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-200 dark:text-gray-900">
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

    // Determine score from row player's perspective
    if (fixture.winner_id === rowId) {
      return `W ${fixture.winner_score}-${fixture.loser_score}`;
    } else {
      return `L ${fixture.loser_score}-${fixture.winner_score}`;
    }
  }

  function getCellColor(rowId: string, colId: string): string {
    if (rowId === colId) return "bg-gray-100 dark:bg-gray-800";
    const fixture = fixtureMap.get(`${rowId}:${colId}`);
    if (!fixture || !fixture.played) return "";

    if (fixture.is_draw) return "bg-yellow-50 dark:bg-yellow-900/20";
    if (fixture.winner_id === rowId) return "bg-green-50 dark:bg-green-900/20";
    return "bg-red-50 dark:bg-red-900/20";
  }

  return (
    <div className="overflow-x-auto">
      <h3 className="mb-2 font-semibold">{t("tournaments.fixtureMatrix")}</h3>
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left"></th>
            {players.map((p) => (
              <th key={p.id} className="px-2 py-1 text-center text-xs">
                {p.name.slice(0, 8)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-2 py-1 font-medium">{row.name}</td>
              {players.map((col) => (
                <td
                  key={col.id}
                  className={`px-2 py-1 text-center text-xs ${getCellColor(row.id, col.id)}`}
                >
                  {getCellContent(row.id, col.id)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
    open: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div>
      <Link
        to={`/g/${slug}/tournaments`}
        className="mb-4 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        {t("tournaments.backToList")}
      </Link>

      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold">{tournament.name}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            statusColors[tournament.status] ?? statusColors.completed
          }`}
        >
          {t(`tournaments.status_${tournament.status}`)}
        </span>
      </div>

      {tournament.standings.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 font-semibold">{t("tournaments.standings")}</h3>
          <div className="overflow-x-auto" style={{ overflow: "visible" }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">{t("leaderboard.player")}</th>
                  <th className="px-2 py-1 text-center"><Tip label={t("tournaments.col_played")} tip={t("tournaments.col_played_tip")} /></th>
                  <th className="px-2 py-1 text-center"><Tip label={t("tournaments.col_wins")} tip={t("tournaments.col_wins_tip")} /></th>
                  <th className="px-2 py-1 text-center"><Tip label={t("tournaments.col_draws")} tip={t("tournaments.col_draws_tip")} /></th>
                  <th className="px-2 py-1 text-center"><Tip label={t("tournaments.col_losses")} tip={t("tournaments.col_losses_tip")} /></th>
                  <th className="px-2 py-1 text-center"><Tip label={t("tournaments.col_sd")} tip={t("tournaments.col_sd_tip")} /></th>
                  <th className="px-2 py-1 text-center font-bold"><Tip label={t("tournaments.col_pts")} tip={t("tournaments.col_pts_tip")} /></th>
                </tr>
              </thead>
              <tbody>
                {tournament.standings.map((s) => (
                  <tr
                    key={s.player_id}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <td className="px-2 py-1">{s.rank}</td>
                    <td className="px-2 py-1">
                      <Link
                        to={`/g/${slug}/player/${s.player_id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {s.display_name}
                      </Link>
                    </td>
                    <td className="px-2 py-1 text-center">{s.wins + s.draws + s.losses}</td>
                    <td className="px-2 py-1 text-center">{s.wins}</td>
                    <td className="px-2 py-1 text-center">{s.draws}</td>
                    <td className="px-2 py-1 text-center">{s.losses}</td>
                    <td className="px-2 py-1 text-center">
                      {s.set_diff >= 0 ? `+${s.set_diff}` : s.set_diff}
                    </td>
                    <td className="px-2 py-1 text-center font-bold">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tournament.fixtures.length > 0 && <FixtureMatrix tournament={tournament} />}

      {tournament.status === "open" && tournament.participants.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 font-semibold">{t("tournaments.participants")}</h3>
          <ul className="list-inside list-decimal">
            {tournament.participants.map((p) => (
              <li key={p.player_id}>{p.display_name}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
          {t("tournaments.rules")}
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>{t("tournaments.rules_format")}</li>
          <li>{t("tournaments.rules_players")}</li>
          <li>{t("tournaments.rules_scoring")}</li>
          <li>{t("tournaments.rules_tiebreakers")}</li>
          <li>{t("tournaments.rules_stale")}</li>
        </ul>
      </details>

      {matches.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-semibold">{t("matches.title")}</h3>
          <div className="flex flex-col gap-2">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-2 rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:hover:bg-gray-700"
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
