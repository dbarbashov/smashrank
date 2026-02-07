import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLeaderboard, useSeasons } from "../api/queries.js";
import { SeasonSelector } from "../components/season-selector.js";
import { PlayerLink } from "../components/player-link.js";
import { EloBadge } from "../components/elo-badge.js";
import { StreakBadge } from "../components/streak-badge.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import type { LeaderboardEntry, SeasonSnapshot } from "../types.js";

export function Leaderboard() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [seasonId, setSeasonId] = useState("");

  const { data: seasons } = useSeasons(slug!);
  const { data, isLoading, error } = useLeaderboard(
    slug!,
    seasonId || undefined,
  );

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  const rows = data ?? [];
  const isSeason = !!seasonId;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("leaderboard.title")}</h2>
        {seasons && seasons.some((s) => !s.is_active) && (
          <SeasonSelector
            seasons={seasons}
            value={seasonId}
            onChange={setSeasonId}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          {t("leaderboard.empty")}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                  <th className="py-2 pr-2">{t("leaderboard.rank")}</th>
                  <th className="py-2">{t("leaderboard.player")}</th>
                  <th className="py-2 text-right">{t("leaderboard.elo")}</th>
                  <th className="py-2 text-right">{t("leaderboard.record")}</th>
                  <th className="py-2 text-right">
                    {t("leaderboard.winRate")}
                  </th>
                  {!isSeason && (
                    <th className="py-2 text-right">
                      {t("leaderboard.streak")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
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

                  return (
                    <tr
                      key={playerId}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="py-2 pr-2 text-gray-500">{rank}</td>
                      <td className="py-2">
                        <PlayerLink id={playerId} name={name} />
                      </td>
                      <td className="py-2 text-right">
                        <EloBadge elo={elo} />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {wins}-{losses}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {winPct}%
                      </td>
                      {!isSeason && (
                        <td className="py-2 text-right">
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
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm text-gray-500">
                      {rank}
                    </span>
                    <div>
                      <PlayerLink id={playerId} name={name} />
                      <div className="text-xs text-gray-500">
                        {entry.wins}-{entry.losses}
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
    </div>
  );
}
