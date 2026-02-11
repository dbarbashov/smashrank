import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSeasons } from "../api/queries.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";

export function Seasons() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: seasons, isLoading, error } = useSeasons(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  if (!seasons || seasons.length === 0) {
    return (
      <p className="py-12 text-center text-slate-500 dark:text-slate-400">{t("seasons.noSeasons")}</p>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("seasons.title")}</h2>
      <div className="flex flex-col gap-2">
        {seasons.map((s) => (
          <Link
            key={s.id}
            to={`/g/${slug}/seasons/${s.id}`}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
          >
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {new Date(s.start_date).toLocaleDateString()}
                {s.end_date
                  ? ` - ${new Date(s.end_date).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                s.is_active
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {s.is_active ? t("seasons.active") : t("seasons.ended")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
