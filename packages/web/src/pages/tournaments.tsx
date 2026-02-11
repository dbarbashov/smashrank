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
      <p className="py-12 text-center text-slate-500 dark:text-slate-400">{t("tournaments.empty")}</p>
    );
  }

  const statusColors: Record<string, string> = {
    open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    completed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("tournaments.title")}</h2>
      <div className="flex flex-col gap-2">
        {tournaments.map((tournament) => (
          <Link
            key={tournament.id}
            to={`/g/${slug}/tournaments/${tournament.id}`}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
          >
            <div>
              <div className="font-medium">{tournament.name}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {new Date(tournament.created_at).toLocaleDateString()}
                {" — "}
                {t("tournaments.players", { count: tournament.participant_count })}
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
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
