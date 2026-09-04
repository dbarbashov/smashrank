import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UsersRound } from "lucide-react";
import {
  useAchievementDefinitions,
  useRecentAchievements,
} from "../api/queries.js";
import { PlayerLink } from "../components/player-link.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import { AchievementDetailsDialog } from "../components/achievement-details-dialog.js";
import type { AchievementDefinition } from "../types.js";

const CATEGORY_ORDER: AchievementDefinition["category"][] = [
  "match", "rating", "opponents", "activity", "doubles", "tournaments", "shame", "meta",
];

export function Achievements() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const [selectedAchievement, setSelectedAchievement] =
    useState<AchievementDefinition | null>(null);

  const {
    data: definitions,
    isLoading,
    error,
  } = useAchievementDefinitions(slug!);
  const { data: recent } = useRecentAchievements(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  return (
    <div className="space-y-8">
      <div className="space-y-8">
        <h2 className="text-lg font-semibold">{t("achievements.definitions")}</h2>
        {CATEGORY_ORDER.map((category) => {
          const categoryDefinitions = definitions?.filter((definition) => definition.category === category) ?? [];
          if (categoryDefinitions.length === 0) return null;
          return (
            <section key={category} aria-labelledby={`achievement-category-${category}`}>
              <div className="mb-4">
                <h3 id={`achievement-category-${category}`} className="font-semibold">
                  {t(`achievementCategories.${category}.name`, category)}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t(`achievementCategories.${category}.description`, "")}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {categoryDefinitions.map((d) => (
            <button
              type="button"
              key={d.id}
              aria-haspopup="dialog"
              onClick={() => setSelectedAchievement(d)}
              className="group relative flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:border-blue-500/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl dark:bg-slate-800">{d.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="pr-12 font-medium">{t(`achievementDefs.${d.id}.name`, d.name)}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{t(`achievementDefs.${d.id}.desc`, d.description)}</div>
                <span
                  className={`absolute right-3 top-3 inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-lg border px-1.5 text-xs font-semibold tabular-nums shadow-sm transition-colors ${
                    d.holder_count > 0
                      ? "border-blue-100 bg-blue-50 text-blue-700 group-hover:border-blue-200 group-hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300 dark:group-hover:bg-blue-400/15"
                      : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                  }`}
                  aria-label={t("achievements.holderCount", { count: d.holder_count })}
                >
                  <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                  {d.holder_count}
                </span>
              </div>
            </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">
          {t("achievements.recent")}
        </h3>
        {!recent || recent.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">{t("achievements.noRecent")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40"
              >
                <span className="text-xl">{a.emoji}</span>
                <div>
                  <span className="font-medium">{t(`achievementDefs.${a.achievement_id}.name`, a.name)}</span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">|</span>
                  <PlayerLink id={a.player_id} name={a.display_name} />
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                      dateStyle: "medium",
                    }).format(new Date(a.unlocked_at))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AchievementDetailsDialog
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievement(null)}
      />
    </div>
  );
}
