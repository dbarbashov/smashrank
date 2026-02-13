import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLeaderboard, useSeasons, useLeaderboardSparklines, useActivityHeatmap } from "../api/queries.js";
import { SeasonSelector } from "../components/season-selector.js";
import { PlayerLink } from "../components/player-link.js";
import { EloBadge } from "../components/elo-badge.js";
import { StreakBadge } from "../components/streak-badge.js";
import { Sparkline } from "../components/sparkline.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import { ActivityHeatmap } from "../components/activity-heatmap.js";
import type { LeaderboardEntry, SeasonSnapshot } from "../types.js";

const INACTIVE_DAYS = 14;
function isPlayerInactive(lastActive: string | null | undefined): boolean {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() > INACTIVE_DAYS * 86400000;
}

export function Leaderboard() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [seasonId, setSeasonId] = useState("");
  const [matchType, setMatchType] = useState<"singles" | "doubles">("singles");

  const { data: seasons } = useSeasons(slug!);
  const typeParam = matchType === "doubles" ? "doubles" : undefined;
  const { data, isLoading, error } = useLeaderboard(
    slug!,
    seasonId || undefined,
    typeParam,
  );
  const { data: sparklines } = useLeaderboardSparklines(slug!, typeParam);
  const { data: activity } = useActivityHeatmap(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  const rows = data ?? [];
  const isSeason = !!seasonId;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("leaderboard.title")}</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${matchType === "singles" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
              onClick={() => setMatchType("singles")}
            >
              {t("leaderboard.singles")}
            </button>
            <button
              className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${matchType === "doubles" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
              onClick={() => setMatchType("doubles")}
            >
              {t("leaderboard.doubles")}
            </button>
          </div>
          {seasons && seasons.some((s) => !s.is_active) && (
            <SeasonSelector
              seasons={seasons}
              value={seasonId}
              onChange={setSeasonId}
            />
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-slate-500 dark:text-slate-400">
          {t("leaderboard.empty")}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-700/60 dark:bg-slate-800/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <th className="px-4 py-3">{t("leaderboard.rank")}</th>
                  <th className="px-4 py-3">{t("leaderboard.player")}</th>
                  <th className="px-4 py-3 text-right">{t("leaderboard.elo")}</th>
                  {!isSeason && (
                    <th className="w-24 px-2 py-3"></th>
                  )}
                  <th className="px-4 py-3 text-right">{t("leaderboard.record")}</th>
                  <th className="px-4 py-3 text-right">{t("leaderboard.games")}</th>
                  <th className="px-4 py-3 text-right">
                    {t("leaderboard.winRate")}
                  </th>
                  {!isSeason && (
                    <th className="px-4 py-3 text-right">
                      {t("leaderboard.streak")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {rows.map((row, i) => {
                  const entry = isSeason
                    ? (row as SeasonSnapshot)
                    : (row as LeaderboardEntry);
                  const elo = isSeason
                    ? (entry as SeasonSnapshot).final_elo
                    : (entry as LeaderboardEntry).elo_rating;
                  const rank = isSeason
                    ? (entry as SeasonSnapshot).final_rank
                    : i + 1;
                  const name = (entry as LeaderboardEntry).display_name
                    ?? (entry as SeasonSnapshot).display_name;
                  const playerId = (entry as LeaderboardEntry).id
                    ?? (entry as SeasonSnapshot).player_id;
                  const wins = entry.wins;
                  const losses = entry.losses;
                  const gp = entry.games_played ?? wins + losses;
                  const winPct =
                    gp > 0 ? Math.round((wins / gp) * 100) : 0;
                  const sparkData = sparklines?.[playerId];
                  const inactive = !isSeason && isPlayerInactive((row as LeaderboardEntry).last_active);

                  return (
                    <tr
                      key={playerId}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${inactive ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-400 dark:text-slate-500">{rank}</td>
                      <td className="px-4 py-3">
                        <PlayerLink id={playerId} name={name} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EloBadge elo={elo} />
                      </td>
                      {!isSeason && (
                        <td className="px-2 py-3">
                          {sparkData && <Sparkline data={sparkData} />}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {wins}-{losses}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {(entry as LeaderboardEntry).sets_played ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {winPct}%
                      </td>
                      {!isSeason && (
                        <td className="px-4 py-3 text-right">
                          <StreakBadge
                            streak={
                              (row as LeaderboardEntry).current_streak ?? 0
                            }
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((row, i) => {
              const entry = isSeason
                ? (row as SeasonSnapshot)
                : (row as LeaderboardEntry);
              const elo = isSeason
                ? (entry as SeasonSnapshot).final_elo
                : (entry as LeaderboardEntry).elo_rating;
              const rank = isSeason
                ? (entry as SeasonSnapshot).final_rank
                : i + 1;
              const name = (entry as LeaderboardEntry).display_name
                ?? (entry as SeasonSnapshot).display_name;
              const playerId = (entry as LeaderboardEntry).id
                ?? (entry as SeasonSnapshot).player_id;

              return (
                <div
                  key={playerId}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-medium text-slate-400 dark:text-slate-500">
                      {rank}
                    </span>
                    <div>
                      <PlayerLink id={playerId} name={name} />
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {entry.wins}-{entry.losses} · {(entry as LeaderboardEntry).sets_played ?? 0}G
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <EloBadge elo={elo} />
                    {!isSeason && (
                      <StreakBadge
                        streak={
                          (row as LeaderboardEntry).current_streak ?? 0
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Activity Heatmap */}
      <div className="mt-6">
        <ActivityHeatmap data={activity} />
      </div>
    </div>
  );
}
