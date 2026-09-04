import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENT_CATALOG,
  type AchievementCategory,
} from "./achievement-catalog.js";

export interface AchievementUnlock {
  achievementId: string;
  playerId: string;
}

export interface AchievementContext {
  matchType: "singles" | "tournament";
  winnerId: string;
  loserId: string;
  winnerStreak: number;
  winnerStreakBefore: number;
  winnerElo: number;
  loserElo: number;
  winnerGamesPlayed: number;
  loserGamesPlayed: number;
  winnerWins: number;
  setScores: { w: number; l: number }[] | null;
  matchesBetween: number;
  winnerRank: number | null;
  winnerExistingAchievements: string[];
  loserExistingAchievements: string[];
  loserStreak: number;
  loserConsecutiveLossesVsWinner: number;
  playedAt?: Date | string;
  eloChange?: number;
  winnerRankBefore?: number | null;
  winnerRankAfter?: number | null;
  loserRankBefore?: number | null;
  challengeType?: string | null;
  challengeInitiatorId?: string | null;
  challengeTargetRank?: number | null;
  recentH2HWinnerIds?: (string | null)[];
  winnerConsecutiveLossesVsLoserBefore?: number;
  winnerTopTwoDefenceStreak?: number;
}

class UnlockCollector {
  readonly unlocks: AchievementUnlock[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly existing: ReadonlyMap<string, ReadonlySet<string>> = new Map()) {}

  grant(achievementId: string, playerId: string): void {
    const key = `${achievementId}:${playerId}`;
    if (this.seen.has(key) || this.existing.get(playerId)?.has(achievementId)) return;
    this.seen.add(key);
    this.unlocks.push({ achievementId, playerId });
  }
}

function existingMap(entries: [string, string[]][]): Map<string, Set<string>> {
  return new Map(entries.map(([playerId, ids]) => [playerId, new Set(ids)]));
}

function moscowHour(value: Date | string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0);
}

export function moscowDateKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function alternates(values: readonly string[]): boolean {
  return values.length > 1 && values.every((value, index) => index === 0 || value !== values[index - 1]);
}

/** Evaluate facts intrinsic to a completed singles or tournament match. */
export function evaluateMatchAchievements(ctx: AchievementContext): AchievementUnlock[] {
  const grants = new UnlockCollector(existingMap([
    [ctx.winnerId, ctx.winnerExistingAchievements],
    [ctx.loserId, ctx.loserExistingAchievements],
  ]));

  if (ctx.winnerWins === 1) grants.grant("first_blood", ctx.winnerId);
  if (ctx.winnerStreak >= 5) grants.grant("on_fire", ctx.winnerId);
  if (ctx.winnerStreak >= 10) grants.grant("unstoppable", ctx.winnerId);
  if (ctx.loserElo - ctx.winnerElo >= 200) grants.grant("giant_killer", ctx.winnerId);
  if (ctx.winnerGamesPlayed >= 50) grants.grant("iron_man", ctx.winnerId);
  if (ctx.loserGamesPlayed >= 50) grants.grant("iron_man", ctx.loserId);
  if (ctx.winnerGamesPlayed >= 100) grants.grant("centurion", ctx.winnerId);
  if (ctx.loserGamesPlayed >= 100) grants.grant("centurion", ctx.loserId);
  if (ctx.winnerStreakBefore <= -3) grants.grant("comeback_kid", ctx.winnerId);
  if (ctx.winnerRank === 1) grants.grant("top_dog", ctx.winnerId);
  if (ctx.matchesBetween >= 10) {
    grants.grant("rivalry", ctx.winnerId);
    grants.grant("rivalry", ctx.loserId);
  }
  if (ctx.winnerGamesPlayed <= 10 && ctx.winnerWins >= 5) grants.grant("newcomer_threat", ctx.winnerId);
  if (ctx.loserStreak <= -5) grants.grant("free_fall", ctx.loserId);
  if (ctx.loserStreak <= -10) grants.grant("rock_bottom", ctx.loserId);
  if (ctx.winnerElo - ctx.loserElo >= 200) grants.grant("punching_bag", ctx.loserId);
  if (ctx.loserElo - ctx.winnerElo >= 200) grants.grant("upset_victim", ctx.loserId);
  if (ctx.loserConsecutiveLossesVsWinner >= 5) grants.grant("doormat", ctx.loserId);

  if (ctx.eloChange !== undefined && ctx.eloChange >= 1 && ctx.eloChange <= 3) {
    grants.grant("small_but_nice", ctx.winnerId);
  }
  if (ctx.playedAt) {
    const hour = moscowHour(ctx.playedAt);
    if (hour <= 3) grants.grant("night_shift", ctx.winnerId);
    if (hour >= 4 && hour <= 9) grants.grant("early_bird", ctx.winnerId);
  }
  if (
    ctx.challengeType === "challenge" &&
    ctx.challengeInitiatorId === ctx.winnerId &&
    ctx.challengeTargetRank === 1
  ) grants.grant("bully", ctx.winnerId);
  if (ctx.winnerRankBefore === 2 && ctx.loserRankBefore === 1 && ctx.winnerRankAfter === 1) {
    grants.grant("throne_shaker", ctx.winnerId);
  }
  if (ctx.matchType === "singles" && (ctx.winnerTopTwoDefenceStreak ?? 0) >= 3) {
    grants.grant("throne_defender", ctx.winnerId);
  }
  if (ctx.matchType === "singles" && (ctx.winnerConsecutiveLossesVsLoserBefore ?? 0) >= 5) {
    grants.grant("broke_the_wall", ctx.winnerId);
  }

  const recentH2H = ctx.recentH2HWinnerIds ?? [];
  const lastFiveH2H = recentH2H.slice(-5);
  if (
    lastFiveH2H.length === 5 &&
    lastFiveH2H.every((playerId): playerId is string => playerId !== null) &&
    alternates(lastFiveH2H)
  ) {
    grants.grant("boomerang", ctx.winnerId);
    grants.grant("boomerang", ctx.loserId);
  }
  if (ctx.matchesBetween >= 10 && recentH2H.length >= ctx.matchesBetween) {
    const winnerWins = recentH2H.filter((id) => id === ctx.winnerId).length;
    const loserWins = recentH2H.filter((id) => id === ctx.loserId).length;
    if (winnerWins === loserWins) {
      grants.grant("perfect_balance", ctx.winnerId);
      grants.grant("perfect_balance", ctx.loserId);
    }
  }

  const scores = ctx.setScores;
  if (!scores || scores.length === 0) return grants.unlocks;

  if (scores.some((set) => set.w === 11 && set.l === 0)) grants.grant("perfect_game", ctx.winnerId);
  if (scores.some((set) => set.l === 11 && set.w === 0)) grants.grant("perfect_game", ctx.loserId);
  if (scores.length >= 3 && scores[0].w < scores[0].l) {
    grants.grant("heartbreaker", ctx.winnerId);
    grants.grant("bottled_it", ctx.loserId);
  }
  if (scores.some((set) => set.w === 11 && set.l === 0)) grants.grant("humbled", ctx.loserId);
  if (scores.some((set) => set.l === 11 && set.w === 0)) grants.grant("glass_cannon", ctx.loserId);

  const winnerSets = scores.filter((set) => set.w > set.l);
  if (winnerSets.length > 0 && winnerSets.every((set) => set.w - set.l === 2)) {
    grants.grant("stolen_victory", ctx.winnerId);
  }
  for (const set of scores) {
    if (set.w >= 20 && set.w - set.l === 2) grants.grant("nerves_of_steel", ctx.winnerId);
    if (set.l >= 20 && set.l - set.w === 2) grants.grant("nerves_of_steel", ctx.loserId);
  }
  if (scores.every((set) => Math.min(set.w, set.l) >= 10)) {
    grants.grant("cardiologist_approved", ctx.winnerId);
    grants.grant("cardiologist_approved", ctx.loserId);
  }
  const normalized = scores.map((set) => `${Math.max(set.w, set.l)}:${Math.min(set.w, set.l)}`);
  for (let index = 2; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1] && normalized[index] === normalized[index - 2]) {
      grants.grant("groundhog_day", ctx.winnerId);
      grants.grant("groundhog_day", ctx.loserId);
      break;
    }
  }
  if (
    scores.some((set) => set.w === 11 && set.l === 0) &&
    scores.some((set) => set.l === 11 && set.w === 0)
  ) {
    grants.grant("rollercoaster", ctx.winnerId);
    grants.grant("rollercoaster", ctx.loserId);
  }
  if (scores[0].w === 0 && scores[0].l === 11) grants.grant("back_from_the_dead", ctx.winnerId);

  return grants.unlocks;
}

export const evaluateAchievements = evaluateMatchAchievements;

export function evaluateDrawScoreAchievements(
  playerAId: string,
  playerBId: string,
  setScores: { w: number; l: number }[] | null,
  existingAchievements: ReadonlyMap<string, readonly string[]> = new Map(),
): AchievementUnlock[] {
  const grants = new UnlockCollector(new Map(
    [...existingAchievements].map(([id, values]) => [id, new Set(values)]),
  ));
  if (!setScores || setScores.length === 0) return [];
  if (setScores.some((set) => set.w === 11 && set.l === 0)) grants.grant("perfect_game", playerAId);
  if (setScores.some((set) => set.l === 11 && set.w === 0)) grants.grant("perfect_game", playerBId);
  for (const set of setScores) {
    if (set.w >= 20 && set.w - set.l === 2) grants.grant("nerves_of_steel", playerAId);
    if (set.l >= 20 && set.l - set.w === 2) grants.grant("nerves_of_steel", playerBId);
  }
  if (setScores.every((set) => Math.min(set.w, set.l) >= 10)) {
    grants.grant("cardiologist_approved", playerAId);
    grants.grant("cardiologist_approved", playerBId);
  }
  const normalized = setScores.map((set) => `${Math.max(set.w, set.l)}:${Math.min(set.w, set.l)}`);
  if (normalized.some((score, index) => index >= 2 && score === normalized[index - 1] && score === normalized[index - 2])) {
    grants.grant("groundhog_day", playerAId);
    grants.grant("groundhog_day", playerBId);
  }
  if (
    setScores.some((set) => set.w === 11 && set.l === 0) &&
    setScores.some((set) => set.l === 11 && set.w === 0)
  ) {
    grants.grant("rollercoaster", playerAId);
    grants.grant("rollercoaster", playerBId);
  }
  return grants.unlocks;
}

export interface PlayerHistoryMatch {
  playedAt: Date | string;
  matchType: "singles" | "tournament" | "doubles" | string;
  won: boolean;
  draw?: boolean;
  opponentIds: string[];
  playerEloBefore?: number;
  opponentEloBefore?: number;
}

export interface PlayerHistoryAchievementContext {
  playerId: string;
  matches: PlayerHistoryMatch[];
  activeOpponentIds?: string[];
  activeDoublesPlayerIds?: string[];
  existingAchievements?: string[];
}

function consecutiveDays(keys: string[]): number {
  const unique = [...new Set(keys)].sort();
  let longest = unique.length > 0 ? 1 : 0;
  let current = longest;
  for (let index = 1; index < unique.length; index += 1) {
    const previous = new Date(`${unique[index - 1]}T12:00:00Z`).getTime();
    const next = new Date(`${unique[index]}T12:00:00Z`).getTime();
    if (next - previous === 86_400_000) current += 1;
    else current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function evaluatePlayerHistoryAchievements(
  ctx: PlayerHistoryAchievementContext,
): AchievementUnlock[] {
  const grants = new UnlockCollector(existingMap([[ctx.playerId, ctx.existingAchievements ?? []]]));
  const matches = [...ctx.matches].sort((a, b) => +new Date(a.playedAt) - +new Date(b.playedAt));

  for (let right = 0, left = 0; right < matches.length; right += 1) {
    while (+new Date(matches[right].playedAt) - +new Date(matches[left].playedAt) > 7_200_000) left += 1;
    if (right - left + 1 >= 5) grants.grant("lunch_break", ctx.playerId);
  }
  if (consecutiveDays(matches.map((match) => moscowDateKey(match.playedAt))) >= 5) {
    grants.grant("no_day_without_ping_pong", ctx.playerId);
  }
  const competitive = matches.filter((match) => match.matchType !== "doubles");
  const recentCompetitive = competitive.slice(-8);
  if (
    recentCompetitive.length === 8 &&
    recentCompetitive.every((match) => !match.draw) &&
    alternates(recentCompetitive.map((match) => String(match.won)))
  ) {
    grants.grant("stable_instability", ctx.playerId);
  }

  const daily = new Map<string, PlayerHistoryMatch[]>();
  for (const match of competitive) {
    const key = moscowDateKey(match.playedAt);
    daily.set(key, [...(daily.get(key) ?? []), match]);
  }
  for (const dayMatches of daily.values()) {
    const beatHigher = dayMatches.some((match) => match.won && (match.opponentEloBefore ?? -Infinity) > (match.playerEloBefore ?? Infinity));
    const lostLower = dayMatches.some((match) => !match.won && !match.draw && (match.opponentEloBefore ?? Infinity) < (match.playerEloBefore ?? -Infinity));
    if (beatHigher && lostLower) grants.grant("robin_hood", ctx.playerId);
    const opponents = new Set(dayMatches.flatMap((match) => match.opponentIds));
    if (opponents.size >= 5) grants.grant("diplomat", ctx.playerId);
  }

  const activeOpponents = new Set((ctx.activeOpponentIds ?? []).filter((id) => id !== ctx.playerId));
  if (activeOpponents.size > 0) {
    const played = new Set(competitive.flatMap((match) => match.opponentIds));
    const beaten = new Set(competitive.filter((match) => match.won).flatMap((match) => match.opponentIds));
    if ([...activeOpponents].every((id) => played.has(id))) grants.grant("community_player", ctx.playerId);
    if ([...activeOpponents].every((id) => beaten.has(id))) grants.grant("collector", ctx.playerId);
  }

  const doubles = matches.filter((match) => match.matchType === "doubles");
  const partnerWins = new Map<string, number>();
  for (const match of doubles.filter((item) => item.won)) {
    const partnerId = match.opponentIds[0];
    if (partnerId) partnerWins.set(partnerId, (partnerWins.get(partnerId) ?? 0) + 1);
  }
  if ([...partnerWins.values()].some((count) => count >= 5)) grants.grant("well_oiled_pair", ctx.playerId);
  if (partnerWins.size >= 5) grants.grant("social_butterfly", ctx.playerId);
  const lastPartners = doubles.slice(-3).map((match) => match.opponentIds[0]).filter(Boolean);
  if (lastPartners.length === 3 && new Set(lastPartners).size === 3) grants.grant("shuffle_lineups", ctx.playerId);
  const activePartners = new Set((ctx.activeDoublesPlayerIds ?? []).filter((id) => id !== ctx.playerId));
  const allPartners = new Set(doubles.map((match) => match.opponentIds[0]).filter(Boolean));
  if (activePartners.size > 0 && [...activePartners].every((id) => allPartners.has(id))) {
    grants.grant("universal_soldier", ctx.playerId);
  }
  return grants.unlocks;
}

export interface DoublesAchievementContext {
  winnerIds: [string, string];
  loserIds: [string, string];
  winnerElos: [number, number];
  loserElos: [number, number];
  previousPartnerByPlayer?: ReadonlyMap<string, string | null>;
  existingAchievements?: ReadonlyMap<string, string[]>;
  playedAt?: Date | string;
}

export function evaluateDoublesAchievements(ctx: DoublesAchievementContext): AchievementUnlock[] {
  const existing = new Map<string, ReadonlySet<string>>();
  for (const playerId of [...ctx.winnerIds, ...ctx.loserIds]) {
    existing.set(playerId, new Set(ctx.existingAchievements?.get(playerId) ?? []));
  }
  const grants = new UnlockCollector(existing);
  if (ctx.loserElos[0] + ctx.loserElos[1] - ctx.winnerElos[0] - ctx.winnerElos[1] >= 200) {
    ctx.winnerIds.forEach((id) => grants.grant("pack_hunt", id));
  }
  if (Math.abs(ctx.winnerElos[0] - ctx.winnerElos[1]) >= 200) {
    grants.grant("hard_carry", ctx.winnerElos[0] > ctx.winnerElos[1] ? ctx.winnerIds[0] : ctx.winnerIds[1]);
  }
  const losers = new Set(ctx.loserIds);
  for (const winnerId of ctx.winnerIds) {
    const previous = ctx.previousPartnerByPlayer?.get(winnerId);
    if (previous && losers.has(previous)) grants.grant("office_divorce", winnerId);
  }
  if (ctx.playedAt) {
    const hour = moscowHour(ctx.playedAt);
    if (hour <= 3) ctx.winnerIds.forEach((id) => grants.grant("night_shift", id));
    if (hour >= 4 && hour <= 9) ctx.winnerIds.forEach((id) => grants.grant("early_bird", id));
  }
  return grants.unlocks;
}

export interface TournamentAchievementContext {
  participantIds: string[];
  standings: Map<string, { wins: number; draws: number; losses: number }>;
  drawCounts: Map<string, number>;
  existingAchievements: Map<string, string[]>;
  fixturesPlayed: Map<string, number>;
  totalFixturesPerPlayer: number;
  winnerId: string | null;
  sortedPlayerIds?: string[];
  points?: Map<string, number>;
  beatenOpponentIds?: Map<string, string[]>;
  firstMatchResult?: Map<string, "win" | "draw" | "loss">;
}

export function evaluateTournamentAchievements(ctx: TournamentAchievementContext): AchievementUnlock[] {
  const existing = new Map<string, ReadonlySet<string>>();
  for (const id of ctx.participantIds) existing.set(id, new Set(ctx.existingAchievements.get(id) ?? []));
  const grants = new UnlockCollector(existing);
  if (ctx.winnerId) {
    grants.grant("tournament_champion", ctx.winnerId);
    if (ctx.firstMatchResult?.get(ctx.winnerId) === "loss") grants.grant("quiet_start", ctx.winnerId);
    const ordered = ctx.sortedPlayerIds ?? [];
    if (ordered.length >= 2 && ctx.points?.get(ordered[0]) === ctx.points?.get(ordered[1])) {
      grants.grant("by_a_whisker", ctx.winnerId);
    }
  }
  for (const playerId of ctx.participantIds) {
    const standing = ctx.standings.get(playerId);
    if (standing?.losses === 0) grants.grant("tournament_undefeated", playerId);
    if ((ctx.fixturesPlayed.get(playerId) ?? 0) >= ctx.totalFixturesPerPlayer) grants.grant("tournament_ironman", playerId);
    if ((ctx.drawCounts.get(playerId) ?? 0) >= 3) grants.grant("draw_master", playerId);
    if ((ctx.beatenOpponentIds?.get(playerId)?.length ?? 0) >= ctx.participantIds.length - 1) grants.grant("clean_sweep", playerId);
    if (standing && standing.wins === 0 && standing.draws >= 3) grants.grant("pacifist", playerId);
  }
  const last = (ctx.sortedPlayerIds ?? []).at(-1);
  if (last && (ctx.fixturesPlayed.get(last) ?? 0) >= ctx.totalFixturesPerPlayer) grants.grant("wooden_spoon", last);
  return grants.unlocks;
}

export interface MetaAchievementContext {
  playerId: string;
  primaryUnlockIds: string[];
  ownedAchievementIds: string[];
  existingAchievements?: string[];
  eventIsMatch?: boolean;
  includeCollection?: boolean;
}

export function evaluateMetaAchievements(ctx: MetaAchievementContext): AchievementUnlock[] {
  const grants = new UnlockCollector(existingMap([[ctx.playerId, ctx.existingAchievements ?? ctx.ownedAchievementIds]]));
  const primary = [...new Set(ctx.primaryUnlockIds)].filter((id) => ACHIEVEMENT_BY_ID.get(id)?.kind !== "meta");
  if (ctx.eventIsMatch !== false) {
    if (primary.length >= 3) grants.grant("jackpot", ctx.playerId);
    const kinds = new Set(primary.map((id) => ACHIEVEMENT_BY_ID.get(id)?.kind));
    if (kinds.has("positive") && kinds.has("shame")) grants.grant("hero_and_villain", ctx.playerId);
  }

  if (ctx.includeCollection !== false) {
    const owned = new Set([...ctx.ownedAchievementIds, ...primary]);
    const categories = new Set(
      ACHIEVEMENT_CATALOG.filter((achievement) => achievement.kind !== "meta").map((achievement) => achievement.category),
    );
    for (const category of categories) {
      const ids = ACHIEVEMENT_CATALOG
        .filter((achievement) => achievement.category === category && achievement.kind !== "meta")
        .map((achievement) => achievement.id);
      if (ids.length > 0 && ids.every((id) => owned.has(id))) {
        grants.grant("full_collection", ctx.playerId);
        break;
      }
    }
  }
  return grants.unlocks;
}

export interface ExclusivityState {
  achievementId: string;
  solePlayerId: string | null;
  uniqueSince: Date | string | null;
}

export function evaluateExclusiveAchievements(
  states: readonly ExclusivityState[],
  now: Date | string = new Date(),
  existingByPlayer: ReadonlyMap<string, readonly string[]> = new Map(),
): AchievementUnlock[] {
  const grants = new UnlockCollector(new Map(
    [...existingByPlayer].map(([id, values]) => [id, new Set(values)]),
  ));
  const nowMs = +new Date(now);
  for (const state of states) {
    if (
      state.solePlayerId && state.uniqueSince &&
      nowMs - +new Date(state.uniqueSince) >= 30 * 86_400_000 &&
      ACHIEVEMENT_BY_ID.get(state.achievementId)?.kind !== "meta"
    ) grants.grant("one_of_a_kind", state.solePlayerId);
  }
  return grants.unlocks;
}

export interface CompletedDayLastMatch {
  playedAt: Date | string;
  participantIds: string[];
}

export function evaluateLightsOutAchievements(
  completedDays: readonly CompletedDayLastMatch[],
  existingByPlayer: ReadonlyMap<string, readonly string[]> = new Map(),
): AchievementUnlock[] {
  const counts = new Map<string, number>();
  for (const day of completedDays) {
    for (const playerId of new Set(day.participantIds)) counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
  }
  const grants = new UnlockCollector(new Map(
    [...existingByPlayer].map(([id, values]) => [id, new Set(values)]),
  ));
  for (const [playerId, count] of counts) if (count >= 5) grants.grant("lights_out", playerId);
  return grants.unlocks;
}

export function achievementsInCategory(category: AchievementCategory): string[] {
  return ACHIEVEMENT_CATALOG.filter((achievement) => achievement.category === category)
    .map((achievement) => achievement.id);
}
