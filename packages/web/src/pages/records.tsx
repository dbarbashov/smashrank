import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRecords } from "../api/queries.js";
import { PlayerLink } from "../components/player-link.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import type { RecordEntry } from "../types.js";

interface RecordCardProps {
  icon: string;
  title: string;
  record: RecordEntry;
  suffix?: string;
}

function RecordCard({ icon, title, record, suffix }: RecordCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl dark:bg-slate-800">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <PlayerLink id={record.playerId} name={record.playerName} />
        </div>
        <div className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100">
          {record.value}{suffix}
        </div>
        {record.detail && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {record.detail}
          </div>
        )}
        {record.date && (
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {new Date(record.date).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecordsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: records, isLoading, error } = useRecords(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!records) return null;

  const cards: { icon: string; title: string; record: RecordEntry; suffix?: string }[] = [];

  if (records.highestElo) {
    cards.push({ icon: "\u{1F451}", title: t("records.highest_elo"), record: records.highestElo });
  }
  if (records.longestStreak) {
    cards.push({ icon: "\u{1F525}", title: t("records.longest_streak"), record: records.longestStreak, suffix: t("records.suffix_wins") });
  }
  if (records.biggestUpset) {
    const upsetRecord = {
      ...records.biggestUpset,
      detail: records.biggestUpset.detail
        ? t("records.upset_detail", { loser: records.biggestUpset.detail })
        : null,
    };
    cards.push({ icon: "\u{1F4A5}", title: t("records.biggest_upset"), record: upsetRecord, suffix: t("records.suffix_elo_gap") });
  }
  if (records.mostMatchesInDay) {
    cards.push({ icon: "\u{26A1}", title: t("records.most_matches_day"), record: records.mostMatchesInDay, suffix: t("records.suffix_matches") });
  }
  if (records.highestEloGain) {
    cards.push({ icon: "\u{1F4C8}", title: t("records.highest_elo_gain"), record: records.highestEloGain, suffix: t("records.suffix_pts") });
  }
  if (records.mostGamesPlayed) {
    cards.push({ icon: "\u{1F3BE}", title: t("records.most_games"), record: records.mostGamesPlayed, suffix: t("records.suffix_games") });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("records.title")}</h2>
      {cards.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">
          {t("records.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <RecordCard
              key={c.title}
              icon={c.icon}
              title={c.title}
              record={c.record}
              suffix={c.suffix}
            />
          ))}
        </div>
      )}
    </div>
  );
}
