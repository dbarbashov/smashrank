import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTournamentDetail } from "../api/queries.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import type { TournamentDetail as TournamentDetailType, TournamentFixture } from "../types.js";

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

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!tournament) return <ErrorMessage message="Tournament not found" />;

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
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">{t("leaderboard.player")}</th>
                  <th className="px-2 py-1 text-center">P</th>
                  <th className="px-2 py-1 text-center">W</th>
                  <th className="px-2 py-1 text-center">D</th>
                  <th className="px-2 py-1 text-center">L</th>
                  <th className="px-2 py-1 text-center">SD</th>
                  <th className="px-2 py-1 text-center font-bold">PTS</th>
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
    </div>
  );
}
