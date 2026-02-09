import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  usePlayer,
  useEloHistory,
  usePlayerMatches,
  usePlayerAchievements,
} from "../api/queries.js";
import { EloBadge } from "../components/elo-badge.js";
import { StreakBadge } from "../components/streak-badge.js";
import { MatchCard } from "../components/match-card.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";

export function PlayerProfile() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { t } = useTranslation();

  const { data: player, isLoading, error } = usePlayer(slug!, id!);
  const { data: eloHistory } = useEloHistory(slug!, id!);
  const { data: matchPages } = usePlayerMatches(slug!, id!);
  const { data: achievements } = usePlayerAchievements(slug!, id!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!player) return null;

  const gp = player.games_played;
  const winPct = gp > 0 ? Math.round((player.wins / gp) * 100) : 0;
  const matches = matchPages?.pages.flat() ?? [];

  const chartData = eloHistory
    ? [
        { date: t("player.start"), elo: 1200 },
        ...eloHistory.map((e) => ({
          date: new Date(e.played_at).toLocaleString(undefined, {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          }),
          elo: e.elo_after,
        })),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="text-xl font-bold">{player.display_name}</h2>
        {player.rank && (
          <p className="text-sm text-gray-500">
            {t("player.rank", { rank: player.rank })} {t("common.of")}{" "}
            {player.total_in_group}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-gray-500">{t("leaderboard.elo")}</div>
            <EloBadge elo={player.elo_rating} />
          </div>
          <div>
            <div className="text-xs text-gray-500">
              {t("leaderboard.record")}
            </div>
            <span className="font-medium tabular-nums">
              {t("player.record", {
                wins: player.wins,
                losses: player.losses,
              })}
            </span>
          </div>
          <div>
            <div className="text-xs text-gray-500">
              {t("player.winRate")}
            </div>
            <span className="font-medium">{winPct}%</span>
          </div>
          <div>
            <div className="text-xs text-gray-500">
              {t("player.streak")}
            </div>
            <StreakBadge streak={player.current_streak} />
          </div>
        </div>
      </div>

      {/* ELO Chart */}
      {chartData.length > 1 && (
        <div>
          <h3 className="mb-2 font-semibold">{t("player.eloHistory")}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="elo"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">{t("player.achievements")}</h3>
          <div className="flex flex-wrap gap-2">
            {achievements.map((a) => (
              <span
                key={a.id}
                title={t(`achievementDefs.${a.achievement_id}.desc`, a.description)}
                className="rounded-full border border-gray-200 px-3 py-1 text-sm dark:border-gray-700"
              >
                {a.emoji} {t(`achievementDefs.${a.achievement_id}.name`, a.name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Matches */}
      <div>
        <h3 className="mb-2 font-semibold">{t("player.recentMatches")}</h3>
        {matches.length === 0 ? (
          <p className="text-gray-500">{t("player.noMatches")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.slice(0, 10).map((m) => (
              <MatchCard key={m.id} match={m} perspectivePlayerId={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
