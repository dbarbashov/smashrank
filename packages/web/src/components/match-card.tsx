import { useTranslation } from "react-i18next";
import { PlayerLink } from "./player-link.js";
import type { Match } from "../types.js";

export function MatchCard({ match, perspectivePlayerId }: { match: Match; perspectivePlayerId?: string }) {
  const { t } = useTranslation();
  const date = new Date(match.played_at).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const score =
    match.winner_score != null && match.loser_score != null
      ? `${match.winner_score}-${match.loser_score}`
      : null;

  const rawSets =
    typeof match.set_scores === "string"
      ? JSON.parse(match.set_scores)
      : match.set_scores;
  const sets = Array.isArray(rawSets)
    ? rawSets.map((s: { w: number; l: number }) => `${s.w}-${s.l}`).join(", ")
    : null;

  const isLoser = perspectivePlayerId && (match.loser_id === perspectivePlayerId || match.loser_partner_id === perspectivePlayerId);
  const displayChange = isLoser ? -match.elo_change : match.elo_change;
  const accentColor = !perspectivePlayerId
    ? "border-l-gray-300 dark:border-l-gray-600"
    : isLoser
      ? "border-l-red-400 dark:border-l-red-500"
      : "border-l-green-400 dark:border-l-green-500";

  return (
    <div className={`flex flex-col gap-1 rounded-xl border border-gray-200 border-l-4 bg-white p-3 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/40 ${accentColor}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {t(`matches.${match.match_type}`)}
        </span>
        <span className="text-gray-400 dark:text-gray-500">{date}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <PlayerLink id={match.winner_id} name={match.winner_name} />
        {match.winner_partner_name && (
          <>
            <span className="text-gray-400">&</span>
            <PlayerLink
              id={match.winner_partner_id!}
              name={match.winner_partner_name}
            />
          </>
        )}
        <span className="text-gray-500 dark:text-gray-400">{match.winner_partner_name ? t("matches.beat_doubles") : t("matches.beat")}</span>
        <PlayerLink id={match.loser_id} name={match.loser_name} />
        {match.loser_partner_name && (
          <>
            <span className="text-gray-400">&</span>
            <PlayerLink
              id={match.loser_partner_id!}
              name={match.loser_partner_name}
            />
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        {score && <span className="font-mono font-medium">{score}</span>}
        {sets && (
          <span className="text-xs text-gray-400 dark:text-gray-500">({sets})</span>
        )}
        <span className={`font-semibold ${displayChange >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {displayChange >= 0 ? "+" : ""}{displayChange}
        </span>
      </div>
    </div>
  );
}
