import type postgres from "postgres";
import { getConnection, closeConnection } from "./connection.js";

/**
 * Recalculates all ELO ratings from match history.
 * Separates singles and doubles into independent rating tracks.
 *
 * Usage:
 *   DATABASE_URL=... node dist/recalculate-elo.js [--dry-run]
 */

const ELO_FLOOR = 100;
const INITIAL_ELO = 1200;

const dryRun = process.argv.includes("--dry-run");

function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed <= 30) return 24;
  return 16;
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

interface PlayerState {
  // Singles
  elo: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  // Doubles
  doublesElo: number;
  doublesGamesPlayed: number;
  doublesWins: number;
  doublesLosses: number;
  doublesCurrentStreak: number;
  doublesBestStreak: number;
}

function defaultState(): PlayerState {
  return {
    elo: INITIAL_ELO,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    doublesElo: INITIAL_ELO,
    doublesGamesPlayed: 0,
    doublesWins: 0,
    doublesLosses: 0,
    doublesCurrentStreak: 0,
    doublesBestStreak: 0,
  };
}

function updateStreak(current: number, best: number, won: boolean): { currentStreak: number; bestStreak: number } {
  const newStreak = won
    ? (current > 0 ? current + 1 : 1)
    : (current < 0 ? current - 1 : -1);
  return { currentStreak: newStreak, bestStreak: Math.max(best, newStreak) };
}

interface MatchRow {
  id: string;
  match_type: string;
  group_id: string;
  winner_id: string;
  loser_id: string;
  winner_score: number;
  loser_score: number;
  winner_partner_id: string | null;
  loser_partner_id: string | null;
  elo_before_winner: number;
  elo_before_loser: number;
  elo_before_winner_partner: number | null;
  elo_before_loser_partner: number | null;
  elo_change: number;
  played_at: Date;
}

async function recalculate(): Promise<void> {
  const sql = getConnection();

  if (dryRun) {
    console.log("=== DRY RUN — no changes will be written ===\n");
  }

  // Get all groups
  const groups = await sql<{ id: string; name: string | null }[]>`
    SELECT id, name FROM groups ORDER BY created_at ASC
  `;

  for (const group of groups) {
    console.log(`\nProcessing group: ${group.name ?? group.id}`);

    // Get all matches for this group in chronological order
    const matches = await sql<MatchRow[]>`
      SELECT
        id, match_type, group_id,
        winner_id, loser_id,
        winner_score, loser_score,
        winner_partner_id, loser_partner_id,
        elo_before_winner, elo_before_loser,
        elo_before_winner_partner, elo_before_loser_partner,
        elo_change, played_at
      FROM matches
      WHERE group_id = ${group.id}
      ORDER BY played_at ASC
    `;

    console.log(`  ${matches.length} matches to replay`);

    // Track player states
    const playerStates = new Map<string, PlayerState>();

    function getState(playerId: string): PlayerState {
      let state = playerStates.get(playerId);
      if (!state) {
        state = defaultState();
        playerStates.set(playerId, state);
      }
      return state;
    }

    // Match updates to apply
    const matchUpdates: { id: string; eloBW: number; eloBL: number; eloBWP: number | null; eloBLP: number | null; eloChange: number }[] = [];

    for (const match of matches) {
      const isDraw = match.winner_score === match.loser_score;

      if (match.match_type === "doubles") {
        // Doubles match — use doubles ratings
        const w1 = getState(match.winner_id);
        const l1 = getState(match.loser_id);
        const w2 = match.winner_partner_id ? getState(match.winner_partner_id) : null;
        const l2 = match.loser_partner_id ? getState(match.loser_partner_id) : null;

        const winnerAvg = w2 ? (w1.doublesElo + w2.doublesElo) / 2 : w1.doublesElo;
        const loserAvg = l2 ? (l1.doublesElo + l2.doublesElo) / 2 : l1.doublesElo;

        const winnerK = w2
          ? Math.min(getKFactor(w1.doublesGamesPlayed), getKFactor(w2.doublesGamesPlayed))
          : getKFactor(w1.doublesGamesPlayed);
        const loserK = l2
          ? Math.min(getKFactor(l1.doublesGamesPlayed), getKFactor(l2.doublesGamesPlayed))
          : getKFactor(l1.doublesGamesPlayed);

        const winnerExpected = expectedScore(winnerAvg, loserAvg);
        const loserExpected = expectedScore(loserAvg, winnerAvg);

        const winnerChange = Math.round(winnerK * (1 - winnerExpected));
        const loserChange = Math.round(loserK * (0 - loserExpected));

        const eloBW = w1.doublesElo;
        const eloBL = l1.doublesElo;
        const eloBWP = w2?.doublesElo ?? null;
        const eloBLP = l2?.doublesElo ?? null;

        // Update w1 doubles
        w1.doublesElo = Math.max(ELO_FLOOR, w1.doublesElo + winnerChange);
        w1.doublesGamesPlayed++;
        w1.doublesWins++;
        const w1s = updateStreak(w1.doublesCurrentStreak, w1.doublesBestStreak, true);
        w1.doublesCurrentStreak = w1s.currentStreak;
        w1.doublesBestStreak = w1s.bestStreak;

        // Update w2 doubles
        if (w2) {
          w2.doublesElo = Math.max(ELO_FLOOR, w2.doublesElo + winnerChange);
          w2.doublesGamesPlayed++;
          w2.doublesWins++;
          const w2s = updateStreak(w2.doublesCurrentStreak, w2.doublesBestStreak, true);
          w2.doublesCurrentStreak = w2s.currentStreak;
          w2.doublesBestStreak = w2s.bestStreak;
        }

        // Update l1 doubles
        l1.doublesElo = Math.max(ELO_FLOOR, l1.doublesElo + loserChange);
        l1.doublesGamesPlayed++;
        l1.doublesLosses++;
        const l1s = updateStreak(l1.doublesCurrentStreak, l1.doublesBestStreak, false);
        l1.doublesCurrentStreak = l1s.currentStreak;
        l1.doublesBestStreak = l1s.bestStreak;

        // Update l2 doubles
        if (l2) {
          l2.doublesElo = Math.max(ELO_FLOOR, l2.doublesElo + loserChange);
          l2.doublesGamesPlayed++;
          l2.doublesLosses++;
          const l2s = updateStreak(l2.doublesCurrentStreak, l2.doublesBestStreak, false);
          l2.doublesCurrentStreak = l2s.currentStreak;
          l2.doublesBestStreak = l2s.bestStreak;
        }

        matchUpdates.push({ id: match.id, eloBW, eloBL, eloBWP, eloBLP, eloChange: winnerChange });
      } else if (isDraw) {
        // Draw (tournament) — singles
        const pA = getState(match.winner_id);
        const pB = getState(match.loser_id);

        const kA = getKFactor(pA.gamesPlayed);
        const kB = getKFactor(pB.gamesPlayed);

        const expectedA = expectedScore(pA.elo, pB.elo);
        const expectedB = expectedScore(pB.elo, pA.elo);

        const eloBW = pA.elo;
        const eloBL = pB.elo;

        const pANew = Math.max(ELO_FLOOR, Math.round(pA.elo + kA * (0.5 - expectedA)));
        const pBNew = Math.max(ELO_FLOOR, Math.round(pB.elo + kB * (0.5 - expectedB)));

        const change = pANew - pA.elo;

        pA.elo = pANew;
        pA.gamesPlayed++;
        pA.currentStreak = 0;

        pB.elo = pBNew;
        pB.gamesPlayed++;
        pB.currentStreak = 0;

        matchUpdates.push({ id: match.id, eloBW, eloBL, eloBWP: null, eloBLP: null, eloChange: change });
      } else {
        // Singles or tournament win/loss — singles ratings
        const winner = getState(match.winner_id);
        const loser = getState(match.loser_id);

        const winnerK = getKFactor(winner.gamesPlayed);
        const loserK = getKFactor(loser.gamesPlayed);

        const winnerExpected = expectedScore(winner.elo, loser.elo);
        const loserExpected = expectedScore(loser.elo, winner.elo);

        const eloBW = winner.elo;
        const eloBL = loser.elo;

        const winnerNew = Math.max(ELO_FLOOR, Math.round(winner.elo + winnerK * (1 - winnerExpected)));
        const loserNew = Math.max(ELO_FLOOR, Math.round(loser.elo + loserK * (0 - loserExpected)));

        const change = winnerNew - winner.elo;

        winner.elo = winnerNew;
        winner.gamesPlayed++;
        winner.wins++;
        const ws = updateStreak(winner.currentStreak, winner.bestStreak, true);
        winner.currentStreak = ws.currentStreak;
        winner.bestStreak = ws.bestStreak;

        loser.elo = loserNew;
        loser.gamesPlayed++;
        loser.losses++;
        const ls = updateStreak(loser.currentStreak, loser.bestStreak, false);
        loser.currentStreak = ls.currentStreak;
        loser.bestStreak = ls.bestStreak;

        matchUpdates.push({ id: match.id, eloBW, eloBL, eloBWP: null, eloBLP: null, eloChange: change });
      }
    }

    if (dryRun) {
      console.log(`  Would update ${playerStates.size} player records and ${matchUpdates.length} match records`);
      for (const [playerId, state] of playerStates) {
        if (state.gamesPlayed > 0 || state.doublesGamesPlayed > 0) {
          console.log(`    ${playerId}: singles=${state.elo} (${state.wins}W-${state.losses}L), doubles=${state.doublesElo} (${state.doublesWins}W-${state.doublesLosses}L)`);
        }
      }
      continue;
    }

    // Apply changes in a transaction
    await sql.begin(async (tx) => {
      const txSql = tx as unknown as postgres.Sql;

      // Get all group members
      const members = await txSql<{ player_id: string }[]>`
        SELECT player_id FROM group_members WHERE group_id = ${group.id}
      `;

      // Reset all members to defaults
      await txSql`
        UPDATE group_members SET
          elo_rating = ${INITIAL_ELO},
          games_played = 0,
          wins = 0,
          losses = 0,
          current_streak = 0,
          best_streak = 0,
          doubles_elo_rating = ${INITIAL_ELO},
          doubles_games_played = 0,
          doubles_wins = 0,
          doubles_losses = 0,
          doubles_current_streak = 0,
          doubles_best_streak = 0
        WHERE group_id = ${group.id}
      `;

      // Apply recalculated player states
      for (const member of members) {
        const state = playerStates.get(member.player_id);
        if (!state) continue;

        await txSql`
          UPDATE group_members SET
            elo_rating = ${state.elo},
            games_played = ${state.gamesPlayed},
            wins = ${state.wins},
            losses = ${state.losses},
            current_streak = ${state.currentStreak},
            best_streak = ${state.bestStreak},
            doubles_elo_rating = ${state.doublesElo},
            doubles_games_played = ${state.doublesGamesPlayed},
            doubles_wins = ${state.doublesWins},
            doubles_losses = ${state.doublesLosses},
            doubles_current_streak = ${state.doublesCurrentStreak},
            doubles_best_streak = ${state.doublesBestStreak}
          WHERE group_id = ${group.id} AND player_id = ${member.player_id}
        `;
      }

      // Update match elo_before/elo_change snapshots
      for (const upd of matchUpdates) {
        await txSql`
          UPDATE matches SET
            elo_before_winner = ${upd.eloBW},
            elo_before_loser = ${upd.eloBL},
            elo_before_winner_partner = ${upd.eloBWP},
            elo_before_loser_partner = ${upd.eloBLP},
            elo_change = ${upd.eloChange}
          WHERE id = ${upd.id}
        `;
      }

      console.log(`  Updated ${playerStates.size} players, ${matchUpdates.length} matches`);
    });
  }

  console.log("\nRecalculation complete.");
  await closeConnection();
}

recalculate().catch((err) => {
  console.error("Recalculation failed:", err);
  process.exit(1);
});
