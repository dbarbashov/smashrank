import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gem,
  Swords,
  TrendingUp,
} from "lucide-react";
import {
  useRecentAchievements,
  useRecentMatches,
  useWeeklyStats,
} from "../api/queries.js";
import type { LeaderboardEntry, MatchType } from "../types.js";
import {
  buildBroadcastEvents,
  formatBroadcastEvent,
  type BroadcastEvent,
} from "./league-broadcast-events.js";
import "./league-broadcast.css";

const ROTATION_INTERVAL_MS = 6000;
const EVENT_CLOCK_INTERVAL_MS = 60_000;

type BroadcastTone = "blue" | "emerald" | "amber" | "violet";

const EVENT_APPEARANCE: Record<
  BroadcastEvent["kind"],
  { icon: typeof Activity; tone: BroadcastTone }
> = {
  upset: { icon: Swords, tone: "amber" },
  achievement: { icon: Gem, tone: "violet" },
  streak: { icon: Flame, tone: "amber" },
  gainer: { icon: TrendingUp, tone: "emerald" },
  match: { icon: Activity, tone: "blue" },
  chase: { icon: TrendingUp, tone: "blue" },
};

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

export function LeagueBroadcast({
  slug,
  leaderboard,
  matchType,
}: {
  slug: string;
  leaderboard: LeaderboardEntry[];
  matchType: MatchType;
}) {
  const { t } = useTranslation();
  const { data: matches } = useRecentMatches(slug, { limit: 3, matchType });
  const { data: achievements } = useRecentAchievements(slug, {
    limit: 3,
    matchType,
  });
  const { data: weeklyStats } = useWeeklyStats(slug, matchType);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPaused = isHovered || hasFocusWithin;

  const events = useMemo(
    () => buildBroadcastEvents({
      slug,
      leaderboard,
      matches,
      achievements,
      weeklyStats,
      now,
    }),
    [achievements, leaderboard, matches, now, slug, weeklyStats],
  );
  const activeIndex = Math.max(
    events.findIndex((event) => event.id === activeId),
    0,
  );
  const activeEvent = events[activeIndex];

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setNow(Date.now()),
      EVENT_CLOCK_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (events.length < 2 || isPaused || prefersReducedMotion) return;

    const intervalId = window.setInterval(() => {
      setActiveId((currentId) => {
        const currentIndex = events.findIndex((event) => event.id === currentId);
        const visibleIndex = currentIndex < 0 ? 0 : currentIndex;
        return events[(visibleIndex + 1) % events.length].id;
      });
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [events, isPaused, prefersReducedMotion]);

  if (!activeEvent) return null;

  const { icon: Icon, tone } = EVENT_APPEARANCE[activeEvent.kind];
  const text = formatBroadcastEvent(activeEvent, t);
  const selectRelativeEvent = (offset: number) => {
    setActiveId(events[(activeIndex + offset + events.length) % events.length].id);
  };

  return (
    <section
      aria-label={t("broadcast.title")}
      className="league-broadcast mb-4"
      data-tone={tone}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocusWithin(false);
        }
      }}
    >
      <div className="league-broadcast-label">
        <span>{t("broadcast.live")}</span>
      </div>

      <div className="h-5 w-px shrink-0 bg-current opacity-15" />

      <Link
        key={activeEvent.id}
        to={activeEvent.to}
        className="league-broadcast-story"
        title={text}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{text}</span>
      </Link>

      {events.length > 1 ? (
        <div className="league-broadcast-controls">
          <span className="hidden text-[10px] font-semibold tabular-nums opacity-60 sm:inline">
            {activeIndex + 1}/{events.length}
          </span>
          <button
            type="button"
            onClick={() => selectRelativeEvent(-1)}
            aria-label={t("broadcast.previous")}
            className="league-broadcast-control"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => selectRelativeEvent(1)}
            aria-label={t("broadcast.next")}
            className="league-broadcast-control"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
