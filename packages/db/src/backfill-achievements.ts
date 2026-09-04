import {
  evaluateDoublesAchievements,
  evaluateDrawScoreAchievements,
  evaluateExclusiveAchievements,
  evaluateLightsOutAchievements,
  evaluateMatchAchievements,
  evaluateMetaAchievements,
  evaluatePlayerHistoryAchievements,
  evaluateTournamentAchievements,
  sortStandings,
  type PlayerHistoryMatch,
} from "@smashrank/core";
import { closeConnection, getConnection } from "./connection.js";
import { achievementQueries } from "./queries/achievements.js";
import { groupQueries } from "./queries/groups.js";
import type { Match } from "./types.js";

type ReplayState = { games: number; wins: number; streak: number };

function participants(match: Match): string[] {
  return [match.winner_id, match.winner_partner_id, match.loser_id, match.loser_partner_id]
    .filter((id): id is string => Boolean(id));
}

function historyEntry(match: Match, playerId: string): PlayerHistoryMatch {
  const draw = match.match_type === "tournament" && match.winner_score === match.loser_score;
  const won = !draw && (match.winner_id === playerId || match.winner_partner_id === playerId);
  if (match.match_type !== "doubles") {
    return {
      playedAt: match.played_at,
      matchType: match.match_type,
      won,
      draw,
      opponentIds: [match.winner_id === playerId ? match.loser_id : match.winner_id],
      playerEloBefore: match.winner_id === playerId ? match.elo_before_winner : match.elo_before_loser,
      opponentEloBefore: match.winner_id === playerId ? match.elo_before_loser : match.elo_before_winner,
    };
  }
  const partner = match.winner_id === playerId ? match.winner_partner_id
    : match.winner_partner_id === playerId ? match.winner_id
      : match.loser_id === playerId ? match.loser_partner_id : match.loser_id;
  const opponents = won
    ? [match.loser_id, match.loser_partner_id]
    : [match.winner_id, match.winner_partner_id];
  return {
    playedAt: match.played_at,
    matchType: match.match_type,
    won,
    opponentIds: [...(partner ? [partner] : []), ...opponents.filter((id): id is string => Boolean(id))],
  };
}

export async function backfillAchievements(now: Date = new Date()): Promise<void> {
  const sql = getConnection();
  const achievements = achievementQueries(sql);
  const groups = groupQueries(sql);
  const groupRows = await sql<{ id: string; settings: Record<string, unknown> }[]>`
    SELECT id, settings FROM groups ORDER BY created_at, id
  `;

  for (const group of groupRows) {
    if (group.settings?.achievements === false) continue;
    const [matches, activeOpponentIds, activeDoublesPlayerIds] = await Promise.all([
      sql<Match[]>`SELECT * FROM matches WHERE group_id = ${group.id} ORDER BY played_at, id`,
      groups.getActivePlayerIds(group.id, "singles", now),
      groups.getActivePlayerIds(group.id, "doubles", now),
    ]);
    const histories = new Map<string, PlayerHistoryMatch[]>();
    const states = new Map<string, ReplayState>();
    const h2h = new Map<string, (string | null)[]>();
    const singlesH2h = new Map<string, string[]>();
    const replayedAchievements = new Map<string, Set<string>>();
    const previousPartner = new Map<string, string | null>();

    for (const match of matches) {
      const playerIds = participants(match);
      const existing = new Map<string, string[]>(playerIds.map((id) => [
        id,
        [...(replayedAchievements.get(id) ?? [])],
      ]));
      for (const playerId of playerIds) {
        histories.set(playerId, [...(histories.get(playerId) ?? []), historyEntry(match, playerId)]);
      }
      let currentH2HWinners: (string | null)[] = [];
      if (match.match_type !== "doubles") {
        const h2hKey = [match.winner_id, match.loser_id].sort().join(":");
        currentH2HWinners = [
          ...(h2h.get(h2hKey) ?? []),
          match.winner_score === match.loser_score ? null : match.winner_id,
        ];
        h2h.set(h2hKey, currentH2HWinners);
        if (match.match_type === "singles") {
          singlesH2h.set(h2hKey, [
            ...(singlesH2h.get(h2hKey) ?? []),
            match.winner_id,
          ]);
        }
      }

      let candidates = playerIds.flatMap((playerId) => evaluatePlayerHistoryAchievements({
        playerId,
        matches: histories.get(playerId) ?? [],
        activeOpponentIds,
        activeDoublesPlayerIds,
        existingAchievements: existing.get(playerId),
      }));

      if (match.match_type === "tournament" && match.winner_score === match.loser_score) {
        candidates.push(...evaluateDrawScoreAchievements(
          match.winner_id,
          match.loser_id,
          typeof match.set_scores === "string" ? JSON.parse(match.set_scores) : match.set_scores,
          existing,
        ));
        for (const playerId of [match.winner_id, match.loser_id]) {
          const state = states.get(playerId) ?? { games: 0, wins: 0, streak: 0 };
          states.set(playerId, { ...state, games: state.games + 1, streak: 0 });
        }
      }

      if (match.match_type === "doubles" && match.winner_partner_id && match.loser_partner_id) {
        candidates.push(...evaluateDoublesAchievements({
          winnerIds: [match.winner_id, match.winner_partner_id],
          loserIds: [match.loser_id, match.loser_partner_id],
          winnerElos: [match.elo_before_winner, match.elo_before_winner_partner ?? match.elo_before_winner],
          loserElos: [match.elo_before_loser, match.elo_before_loser_partner ?? match.elo_before_loser],
          previousPartnerByPlayer: previousPartner,
          existingAchievements: existing,
          playedAt: match.played_at,
        }));
        previousPartner.set(match.winner_id, match.winner_partner_id);
        previousPartner.set(match.winner_partner_id, match.winner_id);
        previousPartner.set(match.loser_id, match.loser_partner_id);
        previousPartner.set(match.loser_partner_id, match.loser_id);
      } else if (match.winner_score !== match.loser_score) {
        const winner = states.get(match.winner_id) ?? { games: 0, wins: 0, streak: 0 };
        const loser = states.get(match.loser_id) ?? { games: 0, wins: 0, streak: 0 };
        let priorLosses = 0;
        const h2hKey = [match.winner_id, match.loser_id].sort().join(":");
        const currentSinglesH2H = singlesH2h.get(h2hKey) ?? [];
        for (const winnerId of currentSinglesH2H.slice(0, -1).reverse()) {
          if (winnerId !== match.loser_id) break;
          priorLosses += 1;
        }
        let currentWins = 0;
        for (const winnerId of [...currentH2HWinners].reverse()) {
          if (winnerId !== match.winner_id) break;
          currentWins += 1;
        }
        const winnerStreak = winner.streak > 0 ? winner.streak + 1 : 1;
        const loserStreak = loser.streak < 0 ? loser.streak - 1 : -1;
        candidates.push(...evaluateMatchAchievements({
          matchType: match.match_type === "tournament" ? "tournament" : "singles",
          winnerId: match.winner_id,
          loserId: match.loser_id,
          winnerStreak,
          winnerStreakBefore: winner.streak,
          winnerElo: match.elo_before_winner,
          loserElo: match.elo_before_loser,
          winnerGamesPlayed: winner.games + 1,
          loserGamesPlayed: loser.games + 1,
          winnerWins: winner.wins + 1,
          setScores: typeof match.set_scores === "string" ? JSON.parse(match.set_scores) : match.set_scores,
          matchesBetween: currentH2HWinners.length,
          winnerRank: match.winner_rank_after,
          winnerExistingAchievements: existing.get(match.winner_id) ?? [],
          loserExistingAchievements: existing.get(match.loser_id) ?? [],
          loserStreak,
          loserConsecutiveLossesVsWinner: currentWins,
          playedAt: match.played_at,
          eloChange: match.elo_change,
          winnerRankBefore: match.winner_rank_before,
          loserRankBefore: match.loser_rank_before,
          winnerRankAfter: match.winner_rank_after,
          challengeType: match.challenge_type,
          challengeInitiatorId: match.challenge_initiator_id,
          challengeTargetRank: match.challenge_target_rank,
          recentH2HWinnerIds: currentH2HWinners,
          winnerConsecutiveLossesVsLoserBefore: priorLosses,
        }));
        states.set(match.winner_id, { games: winner.games + 1, wins: winner.wins + 1, streak: winnerStreak });
        states.set(match.loser_id, { games: loser.games + 1, wins: loser.wins, streak: loserStreak });
      }

      candidates = candidates.filter((candidate, index, all) =>
        all.findIndex((item) => item.playerId === candidate.playerId && item.achievementId === candidate.achievementId) === index
      );
      const awarded = await achievements.awardMany(
        group.id,
        candidates,
        { type: "match", id: match.id },
        match.played_at,
      );
      const awardedPrimary = awarded.map((row) => ({
        playerId: row.player_id,
        achievementId: row.achievement_id,
      }));
      for (const award of awardedPrimary) {
        const replayed = replayedAchievements.get(award.playerId) ?? new Set<string>();
        replayed.add(award.achievementId);
        replayedAchievements.set(award.playerId, replayed);
      }
      // Derive event-based meta rewards only from awards persisted for this match.
      for (const playerId of new Set(awardedPrimary.map((award) => award.playerId))) {
        const owned = await achievements.getPlayerAchievementIds(playerId, group.id);
        const meta = evaluateMetaAchievements({
          playerId,
          primaryUnlockIds: awardedPrimary.filter((award) => award.playerId === playerId).map((award) => award.achievementId),
          ownedAchievementIds: owned,
          eventIsMatch: true,
          includeCollection: false,
        });
        if (meta.length > 0) {
          const triggerIds = awardedPrimary
            .filter((award) => award.playerId === playerId)
            .map((award) => award.achievementId);
          await achievements.awardMany(group.id, meta, {
            type: "meta",
            context: { match_id: match.id, trigger_achievement_ids: triggerIds },
          }, match.played_at);
        }
      }
    }

    const completedTournaments = await sql<{ id: string; completed_at: Date }[]>`
      SELECT id, completed_at FROM tournaments
      WHERE group_id = ${group.id} AND status = 'completed'
      ORDER BY completed_at, id
    `;
    for (const tournament of completedTournaments) {
      const [standings, tournamentMatches] = await Promise.all([
        sql<{ player_id: string; points: number; wins: number; draws: number; losses: number; sets_won: number; sets_lost: number; elo_rating: number }[]>`
          SELECT ts.*, gm.elo_rating
          FROM tournament_standings ts
          JOIN tournaments t ON t.id = ts.tournament_id
          JOIN group_members gm ON gm.group_id = t.group_id AND gm.player_id = ts.player_id
          WHERE ts.tournament_id = ${tournament.id}
        `,
        sql<Match[]>`SELECT * FROM matches WHERE tournament_id = ${tournament.id} ORDER BY played_at, id`,
      ]);
      const h2hWinners = new Map<string, string | null>();
      const beaten = new Map<string, string[]>();
      const first = new Map<string, "win" | "draw" | "loss">();
      for (const match of tournamentMatches) {
        const key = [match.winner_id, match.loser_id].sort().join(":");
        const draw = match.winner_score === match.loser_score;
        h2hWinners.set(key, draw ? null : match.winner_id);
        if (!draw) beaten.set(match.winner_id, [...(beaten.get(match.winner_id) ?? []), match.loser_id]);
        for (const playerId of [match.winner_id, match.loser_id]) {
          if (!first.has(playerId)) first.set(playerId, draw ? "draw" : match.winner_id === playerId ? "win" : "loss");
        }
      }
      const sorted = sortStandings(standings.map((standing) => ({
        playerId: standing.player_id,
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        setsWon: standing.sets_won,
        setsLost: standing.sets_lost,
        eloRating: standing.elo_rating,
      })), h2hWinners);
      const tournamentExisting = new Map(await Promise.all(standings.map(async (standing) => [
        standing.player_id,
        await achievements.getPlayerAchievementIds(standing.player_id, group.id),
      ] as const)));
      const tournamentAwards = evaluateTournamentAchievements({
        participantIds: standings.map((standing) => standing.player_id),
        standings: new Map(standings.map((standing) => [standing.player_id, {
          wins: standing.wins, draws: standing.draws, losses: standing.losses,
        }])),
        drawCounts: new Map(standings.map((standing) => [standing.player_id, standing.draws])),
        existingAchievements: tournamentExisting,
        fixturesPlayed: new Map(standings.map((standing) => [
          standing.player_id, standing.wins + standing.draws + standing.losses,
        ])),
        totalFixturesPerPlayer: Math.max(0, standings.length - 1),
        winnerId: sorted[0]?.playerId ?? null,
        sortedPlayerIds: sorted.map((standing) => standing.playerId),
        points: new Map(standings.map((standing) => [standing.player_id, standing.points])),
        beatenOpponentIds: beaten,
        firstMatchResult: first,
      });
      await achievements.awardMany(
        group.id,
        tournamentAwards,
        { type: "tournament", id: tournament.id },
        tournament.completed_at,
      );
    }

    const seasonLeaders = await sql<{ season_id: string; player_id: string; end_date: string }[]>`
      SELECT season_id, player_id, end_date
      FROM (
        SELECT
          ss.season_id,
          ss.player_id,
          s.end_date,
          ROW_NUMBER() OVER (
            PARTITION BY ss.season_id
            ORDER BY (ss.games_played + ss.doubles_games_played) DESC, ss.player_id
          ) AS position
        FROM season_snapshots ss
        JOIN seasons s ON s.id = ss.season_id
        WHERE s.group_id = ${group.id}
      ) ranked
      WHERE position = 1
      ORDER BY end_date, season_id
    `;
    for (const leader of seasonLeaders) {
      await achievements.awardMany(
        group.id,
        [{ playerId: leader.player_id, achievementId: "party_worker" }],
        { type: "season", id: leader.season_id },
        new Date(`${leader.end_date}T20:59:59Z`),
      );
    }

    const completedDays = await achievements.listCompletedDayLastMatches(group.id, now);
    await achievements.awardMany(group.id, evaluateLightsOutAchievements(completedDays.map((match) => ({
      playedAt: match.played_at,
      participantIds: match.participant_ids,
    }))), { type: "meta", context: { category: "activity", background: "lights_out" } }, now);

    const completedCollections = await sql<{
      player_id: string;
      category: string;
      completed_at: Date;
    }[]>`
      WITH category_totals AS (
        SELECT category, COUNT(*)::int AS total
        FROM achievement_definitions
        WHERE kind != 'meta'
        GROUP BY category
      ), completed AS (
        SELECT
          pa.player_id,
          ad.category,
          MAX(pa.unlocked_at) AS completed_at
        FROM player_achievements pa
        JOIN achievement_definitions ad ON ad.id = pa.achievement_id
        JOIN category_totals totals ON totals.category = ad.category
        WHERE pa.group_id = ${group.id} AND ad.kind != 'meta'
        GROUP BY pa.player_id, ad.category, totals.total
        HAVING COUNT(DISTINCT pa.achievement_id) = totals.total
      )
      SELECT DISTINCT ON (player_id) player_id, category, completed_at
      FROM completed
      ORDER BY player_id, completed_at, category
    `;
    for (const collection of completedCollections) {
      await achievements.awardMany(group.id, [{
        playerId: collection.player_id,
        achievementId: "full_collection",
      }], {
        type: "meta",
        context: { category: collection.category, background: "backfill" },
      }, collection.completed_at);
    }

    const exclusive = await achievements.listMaturedExclusivity(group.id, now);
    for (const award of evaluateExclusiveAchievements(exclusive.map((state) => ({
      achievementId: state.achievement_id,
      solePlayerId: state.sole_player_id,
      uniqueSince: state.unique_since,
    })), now)) {
      await achievements.awardMany(group.id, [award], {
        type: "meta",
        context: { category: "meta", background: "one_of_a_kind" },
      }, now);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  backfillAchievements()
    .then(() => closeConnection())
    .catch(async (error) => {
      console.error(error);
      await closeConnection();
      process.exitCode = 1;
    });
}
