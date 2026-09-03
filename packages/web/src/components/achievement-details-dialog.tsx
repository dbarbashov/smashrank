import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UsersRound, X } from "lucide-react";
import { useAchievementDetails } from "../api/queries.js";
import type {
  AchievementDefinition,
  AchievementHolder,
  AchievementSource,
} from "../types.js";
import { PlayerLink } from "./player-link.js";

function formatSource(
  source: Extract<AchievementSource, { type: "match" }>,
) {
  const sets = source.set_scores
    ?.map((set) => `${set.w}-${set.l}`)
    .join(", ");
  const score = `${source.player_score}-${source.opponent_score}`;
  return sets ? `${score} (${sets})` : score;
}

function HolderSource({ source }: { source: AchievementSource | null }) {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  if (!source) {
    return <span>{t("achievements.sourceMissing")}</span>;
  }

  if (source.type === "match") {
    return (
      <span>
        {source.opponent_name
          ? t("achievements.against", { name: source.opponent_name })
          : t("achievements.match")}
        <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
        <span className="font-mono font-medium">{formatSource(source)}</span>
      </span>
    );
  }

  const label = source.name ?? (
    source.type === "tournament"
      ? t("achievements.tournament")
      : t("achievements.season")
  );
  const path = source.type === "tournament"
    ? `/g/${slug}/tournaments/${source.id}`
    : `/g/${slug}/seasons/${source.id}`;

  return (
    <Link
      to={path}
      className="font-medium text-slate-600 hover:text-blue-700 hover:underline dark:text-slate-300 dark:hover:text-blue-300"
    >
      {source.type === "tournament"
        ? t("achievements.inTournament", { name: label })
        : t("achievements.inSeason", { name: label })}
    </Link>
  );
}

function HolderRow({
  holder,
  badge,
}: {
  holder: AchievementHolder;
  badge?: "first" | "latest";
}) {
  const { t, i18n } = useTranslation();
  const formattedDate = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(holder.unlocked_at));

  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <PlayerLink id={holder.player_id} name={holder.display_name} />
          {badge ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
              {t(`achievements.${badge}`)}
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {formattedDate}
        </div>
        <div className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          <HolderSource source={holder.source} />
        </div>
      </div>
    </li>
  );
}

export function AchievementDetailsDialog({
  achievement,
  onClose,
}: {
  achievement: AchievementDefinition | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useAchievementDetails(
    slug!,
    achievement?.id ?? null,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (achievement && !dialog.open) {
      dialog.showModal();
    } else if (!achievement && dialog.open) {
      dialog.close();
    }
  }, [achievement]);

  const closeDialog = () => dialogRef.current?.close();
  const holders = data?.holders ?? [];
  const percentage = data && data.total_players > 0
    ? Math.round((data.holder_count / data.total_players) * 100)
    : 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="achievement-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      className="m-0 mt-auto h-[min(48rem,88dvh)] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45 dark:bg-slate-900 dark:text-slate-100 sm:m-auto sm:h-[min(48rem,94dvh)] sm:max-w-lg sm:rounded-2xl"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" />
      <div className="flex h-[calc(100%-0.75rem)] flex-col">
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800 sm:px-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-3xl dark:bg-slate-800">
            {achievement?.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="achievement-dialog-title" className="text-lg font-semibold">
              {achievement
                ? t(`achievementDefs.${achievement.id}.name`, achievement.name)
                : ""}
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-slate-500 dark:text-slate-400">
              {achievement
                ? t(`achievementDefs.${achievement.id}.desc`, achievement.description)
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label={t("achievements.close")}
            className="-mr-1 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoading ? (
            <div className="space-y-3" aria-label={t("common.loading")}>
              <div className="h-9 w-36 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                {t("achievements.retry")}
              </button>
            </div>
          ) : data ? (
            holders.length === 0 ? (
              <div className="relative min-h-[14.5rem]">
                <div className="absolute left-0 top-0 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {t("achievements.share", {
                      count: data.holder_count,
                      total: data.total_players,
                      percentage,
                    })}
                  </span>
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <div className="text-3xl" aria-hidden="true">✨</div>
                  <p className="mt-3 font-medium">{t("achievements.nobodyYet")}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                  <UsersRound className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {t("achievements.share", {
                      count: data.holder_count,
                      total: data.total_players,
                      percentage,
                    })}
                  </span>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t("achievements.holders")}
                  </h3>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {holders.map((holder, index) => {
                      const isOnly = holders.length === 1;
                      const badge = index === holders.length - 1
                        ? "first"
                        : index === 0 && !isOnly
                          ? "latest"
                          : undefined;
                      return <HolderRow key={holder.id} holder={holder} badge={badge} />;
                    })}
                  </ul>
                </div>
              </>
            )
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
