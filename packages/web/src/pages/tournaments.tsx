import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTournaments } from "../api/queries.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";

export function Tournaments() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: tournaments, isLoading, error } = useTournaments(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  if (!tournaments || tournaments.length === 0) {
    return (
      <p className="py-8 text-center text-gray-500">{t("tournaments.empty")}</p>
    );
  }

  const statusColors: Record<string, string> = {
    open: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("tournaments.title")}</h2>
      <div className="flex flex-col gap-2">
        {tournaments.map((tournament) => (
          <Link
            key={tournament.id}
            to={`/g/${slug}/tournaments/${tournament.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div>
              <div className="font-medium">{tournament.name}</div>
              <div className="text-sm text-gray-500">
                {new Date(tournament.created_at).toLocaleDateString()}
                {" — "}
                {t("tournaments.players", { count: tournament.participant_count })}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                statusColors[tournament.status] ?? statusColors.completed
              }`}
            >
              {t(`tournaments.status_${tournament.status}`)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
