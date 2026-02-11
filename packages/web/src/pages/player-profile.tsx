import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  usePlayer,
  useEloHistory,
  usePlayerMatches,
  usePlayerAchievements,
  usePlayerOpponents,
  useActivityHeatmap,
} from "../api/queries.js";
import { EloBadge } from "../components/elo-badge.js";
import { StreakBadge } from "../components/streak-badge.js";
import { MatchCard } from "../components/match-card.js";
import { Avatar } from "../components/avatar.js";
import { Loading } from "../components/loading.js";
import { ErrorMessage } from "../components/error-message.js";
import { ActivityHeatmap } from "../components/activity-heatmap.js";

export function PlayerProfile() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { t } = useTranslation();

  const { data: player, isLoading, error } = usePlayer(slug!, id!);
  const { data: eloHistory } = useEloHistory(slug!, id!);
  const { data: matchPages } = usePlayerMatches(slug!, id!);
  const { data: achievements } = usePlayerAchievements(slug!, id!);
  const { data: opponents } = usePlayerOpponents(slug!, id!);
  const { data: activity } = useActivityHeatmap(slug!, id!);

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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
        <div className="flex items-center gap-4">
          <Avatar playerId={player.id} name={player.display_name} size="lg" />
          <div>
            <h2 className="text-xl font-bold">{player.display_name}</h2>
            {player.rank && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("player.rank", { rank: player.rank })} {t("common.of")}{" "}
                {player.total_in_group}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("leaderboard.elo")}</div>
            <div className="mt-1"><EloBadge elo={player.elo_rating} /></div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t("leaderboard.record")}
            </div>
            <span className="mt-1 font-medium tabular-nums">
              {t("player.record", {
                wins: player.wins,
                losses: player.losses,
              })}
            </span>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t("player.winRate")}
            </div>
            <span className="mt-1 font-medium">{winPct}%</span>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t("player.streak")}
            </div>
            <div className="mt-1"><StreakBadge streak={player.current_streak} /></div>
          </div>
        </div>
      </div>

      {/* Doubles Stats */}
      {player.doubles_games_played > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h3 className="mb-3 font-semibold">{t("player.doublesStats")}</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("leaderboard.elo")}</div>
              <div className="mt-1"><EloBadge elo={player.doubles_elo_rating} /></div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("leaderboard.record")}</div>
              <span className="mt-1 font-medium tabular-nums">
                {t("player.record", {
                  wins: player.doubles_wins,
                  losses: player.doubles_losses,
                })}
              </span>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("player.winRate")}</div>
              <span className="mt-1 font-medium">
                {Math.round((player.doubles_wins / player.doubles_games_played) * 100)}%
              </span>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("player.streak")}</div>
              <div className="mt-1"><StreakBadge streak={player.doubles_current_streak} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ELO Chart */}
      {chartData.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/40">
          <h3 className="mb-3 font-semibold">{t("player.eloHistory")}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Line
                type="monotone"
                dataKey="elo"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">{t("player.achievements")}</h3>
          <div className="flex flex-wrap gap-2">
            {achievements.map((a) => (
              <span
                key={a.id}
                title={t(`achievementDefs.${a.achievement_id}.desc`, a.description)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium dark:bg-slate-800"
              >
                {a.emoji} {t(`achievementDefs.${a.achievement_id}.name`, a.name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Frequent Opponents */}
      {opponents && opponents.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold">{t("player.frequentOpponents")}</h3>
          <div className="flex flex-col gap-1.5">
            {opponents.map((opp) => (
              <Link
                key={opp.id}
                to={`/g/${slug}/player/${id}/h2h/${opp.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-center gap-2">
                  <Avatar playerId={opp.id} name={opp.display_name} size="sm" />
                  <span className="font-medium">{opp.display_name}</span>
                </div>
                <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                  {opp.wins}W-{opp.losses}L ({opp.match_count})
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Activity Heatmap */}
      {activity && activity.length > 0 && (
        <ActivityHeatmap data={activity} />
      )}

      {/* Recent Matches */}
      <div>
        <h3 className="mb-3 font-semibold">{t("player.recentMatches")}</h3>
        {matches.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">{t("player.noMatches")}</p>
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
