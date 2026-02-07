import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "./client.js";
import type {
  GroupInfo,
  LeaderboardEntry,
  PlayerProfile,
  EloHistoryEntry,
  Match,
  AchievementDefinition,
  PlayerAchievement,
  RecentAchievement,
  Season,
  SeasonDetail,
  SeasonSnapshot,
  WeeklyStats,
  TournamentSummary,
  TournamentDetail,
} from "../types.js";

export function useGroupInfo(slug: string) {
  return useQuery({
    queryKey: ["group-info", slug],
    queryFn: () => apiFetch<GroupInfo>(`/${slug}/info`),
  });
}

export function useLeaderboard(slug: string, seasonId?: string) {
  return useQuery({
    queryKey: ["leaderboard", slug, seasonId],
    queryFn: () => {
      const params = seasonId ? `?season=${seasonId}` : "";
      return apiFetch<LeaderboardEntry[] | SeasonSnapshot[]>(
        `/${slug}/leaderboard${params}`,
      );
    },
  });
}

export function usePlayer(slug: string, playerId: string) {
  return useQuery({
    queryKey: ["player", slug, playerId],
    queryFn: () => apiFetch<PlayerProfile>(`/${slug}/players/${playerId}`),
  });
}

export function useEloHistory(slug: string, playerId: string) {
  return useQuery({
    queryKey: ["elo-history", slug, playerId],
    queryFn: () =>
      apiFetch<EloHistoryEntry[]>(`/${slug}/players/${playerId}/elo-history`),
  });
}

export function usePlayerMatches(slug: string, playerId: string) {
  return useInfiniteQuery({
    queryKey: ["player-matches", slug, playerId],
    queryFn: ({ pageParam = 0 }) =>
      apiFetch<Match[]>(
        `/${slug}/players/${playerId}/matches?limit=20&offset=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === 20 ? lastPageParam + 20 : undefined,
  });
}

export function usePlayerAchievements(slug: string, playerId: string) {
  return useQuery({
    queryKey: ["player-achievements", slug, playerId],
    queryFn: () =>
      apiFetch<PlayerAchievement[]>(
        `/${slug}/players/${playerId}/achievements`,
      ),
  });
}

export function useMatches(
  slug: string,
  filters?: { type?: string; player?: string },
) {
  return useInfiniteQuery({
    queryKey: ["matches", slug, filters],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("offset", String(pageParam));
      if (filters?.type) params.set("type", filters.type);
      if (filters?.player) params.set("player", filters.player);
      return apiFetch<Match[]>(`/${slug}/matches?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === 20 ? lastPageParam + 20 : undefined,
  });
}

export function useAchievementDefinitions(slug: string) {
  return useQuery({
    queryKey: ["achievement-defs", slug],
    queryFn: () => apiFetch<AchievementDefinition[]>(`/${slug}/achievements`),
  });
}

export function useRecentAchievements(slug: string) {
  return useQuery({
    queryKey: ["recent-achievements", slug],
    queryFn: () =>
      apiFetch<RecentAchievement[]>(`/${slug}/achievements/recent`),
  });
}

export function useSeasons(slug: string) {
  return useQuery({
    queryKey: ["seasons", slug],
    queryFn: () => apiFetch<Season[]>(`/${slug}/seasons`),
  });
}

export function useSeasonDetail(slug: string, seasonId: string) {
  return useQuery({
    queryKey: ["season", slug, seasonId],
    queryFn: () => apiFetch<SeasonDetail>(`/${slug}/seasons/${seasonId}`),
  });
}

export function useWeeklyStats(slug: string) {
  return useQuery({
    queryKey: ["weekly-stats", slug],
    queryFn: () => apiFetch<WeeklyStats>(`/${slug}/stats/weekly`),
  });
}

export function useTournaments(slug: string) {
  return useQuery({
    queryKey: ["tournaments", slug],
    queryFn: () => apiFetch<TournamentSummary[]>(`/${slug}/tournaments`),
  });
}

export function useTournamentDetail(slug: string, tournamentId: string) {
  return useQuery({
    queryKey: ["tournament", slug, tournamentId],
    queryFn: () => apiFetch<TournamentDetail>(`/${slug}/tournaments/${tournamentId}`),
    enabled: !!tournamentId,
  });
}
