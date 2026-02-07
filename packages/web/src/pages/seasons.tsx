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
      <p className="py-8 text-center text-gray-500">{t("seasons.noSeasons")}</p>
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
            className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-gray-500">
                {new Date(s.start_date).toLocaleDateString()}
                {s.end_date
                  ? ` - ${new Date(s.end_date).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                s.is_active
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
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
