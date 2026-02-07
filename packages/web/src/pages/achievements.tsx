import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useAchievementDefinitions,
  useRecentAchievements,
} from "../api/queries.js";
import { PlayerLink } from "../components/player-link.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";

export function Achievements() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  const {
    data: definitions,
    isLoading,
    error,
  } = useAchievementDefinitions(slug!);
  const { data: recent } = useRecentAchievements(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          {t("achievements.definitions")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {definitions?.map((d) => (
            <div
              key={d.id}
              className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            >
              <span className="text-2xl">{d.emoji}</span>
              <div>
                <div className="font-medium">{t(`achievementDefs.${d.id}.name`, d.name)}</div>
                <div className="text-sm text-gray-500">{t(`achievementDefs.${d.id}.desc`, d.description)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold">
          {t("achievements.recent")}
        </h3>
        {!recent || recent.length === 0 ? (
          <p className="text-gray-500">{t("achievements.noRecent")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <span className="text-xl">{a.emoji}</span>
                <div>
                  <span className="font-medium">{t(`achievementDefs.${a.achievement_id}.name`, a.name)}</span>
                  <span className="mx-1 text-gray-400">-</span>
                  <PlayerLink id={a.player_id} name={a.display_name} />
                  <div className="text-xs text-gray-500">
                    {new Date(a.unlocked_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
