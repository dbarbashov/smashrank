import { beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setConnection, closeConnection } from "@smashrank/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

let sql: postgres.Sql;

const MIGRATIONS_DIR = join(__dirname, "../../../db/migrations");

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set for E2E tests");
  }

  sql = postgres(url);
  setConnection(sql);
});

afterAll(async () => {
  await closeConnection();
});

export async function cleanDb(): Promise<void> {
  await sql`TRUNCATE tournament_standings, tournament_participants, tournaments, player_achievements, matches, season_snapshots, seasons, group_members, groups, players CASCADE`;
  await sql`DELETE FROM achievement_definitions WHERE true`;
  const seed = readFileSync(join(MIGRATIONS_DIR, "002_seed_achievements.sql"), "utf-8");
  await sql.unsafe(seed);
}

export function getSql(): postgres.Sql {
  return sql;
}

export async function createGroup(data: {
  name?: string;
  slug?: string;
  chat_id?: number;
}): Promise<{ id: string; slug: string }> {
  const slug = data.slug ?? `test-${Math.random().toString(36).slice(2, 10)}`;
  const rows = await sql<{ id: string; slug: string }[]>`
    INSERT INTO groups (chat_id, name, slug)
    VALUES (${data.chat_id ?? Math.floor(Math.random() * 1000000)}, ${data.name ?? "Test Group"}, ${slug})
    RETURNING id, slug
  `;
  return rows[0];
}

export async function createPlayer(data: {
  display_name: string;
  telegram_id?: number;
  elo_rating?: number;
  games_played?: number;
  wins?: number;
  losses?: number;
  current_streak?: number;
  best_streak?: number;
}): Promise<{ id: string; _stats: { elo_rating: number; games_played: number; wins: number; losses: number; current_streak: number; best_streak: number } }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO players (telegram_id, display_name)
    VALUES (
      ${data.telegram_id ?? Math.floor(Math.random() * 1000000)},
      ${data.display_name}
    )
    RETURNING id
  `;
  return {
    ...rows[0],
    _stats: {
      elo_rating: data.elo_rating ?? 1200,
      games_played: data.games_played ?? 0,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      current_streak: data.current_streak ?? 0,
      best_streak: data.best_streak ?? 0,
    },
  };
}

export async function addToGroup(groupId: string, playerId: string, stats?: {
  elo_rating?: number;
  games_played?: number;
  wins?: number;
  losses?: number;
  current_streak?: number;
  best_streak?: number;
  doubles_elo_rating?: number;
  doubles_games_played?: number;
  doubles_wins?: number;
  doubles_losses?: number;
}): Promise<void> {
  await sql`
    INSERT INTO group_members (
      group_id, player_id, elo_rating, games_played, wins, losses, current_streak, best_streak,
      doubles_elo_rating, doubles_games_played, doubles_wins, doubles_losses
    )
    VALUES (
      ${groupId}, ${playerId},
      ${stats?.elo_rating ?? 1200},
      ${stats?.games_played ?? 0},
      ${stats?.wins ?? 0},
      ${stats?.losses ?? 0},
      ${stats?.current_streak ?? 0},
      ${stats?.best_streak ?? 0},
      ${stats?.doubles_elo_rating ?? 1200},
      ${stats?.doubles_games_played ?? 0},
      ${stats?.doubles_wins ?? 0},
      ${stats?.doubles_losses ?? 0}
    )
    ON CONFLICT DO NOTHING
  `;
}

export async function createSeason(data: {
  group_id: string;
  name: string;
  is_active?: boolean;
}): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO seasons (group_id, name, start_date, end_date, is_active)
    VALUES (${data.group_id}, ${data.name}, NOW() - INTERVAL '30 days', NOW(), ${data.is_active ?? false})
    RETURNING id
  `;
  return rows[0];
}

export async function createTournament(data: {
  group_id: string;
  name: string;
  status?: "open" | "active" | "completed";
  created_by: string;
}): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tournaments (group_id, name, status, created_by)
    VALUES (${data.group_id}, ${data.name}, ${data.status ?? "open"}, ${data.created_by})
    RETURNING id
  `;
  return rows[0];
}

export async function addTournamentParticipant(tournamentId: string, playerId: string): Promise<void> {
  await sql`
    INSERT INTO tournament_participants (tournament_id, player_id)
    VALUES (${tournamentId}, ${playerId})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO tournament_standings (tournament_id, player_id)
    VALUES (${tournamentId}, ${playerId})
    ON CONFLICT DO NOTHING
  `;
}

export async function createMatch(data: {
  group_id: string;
  season_id: string;
  winner_id: string;
  loser_id: string;
  winner_score?: number;
  loser_score?: number;
  elo_before_winner?: number;
  elo_before_loser?: number;
  elo_change?: number;
  match_type?: string;
}): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO matches (
      match_type, season_id, group_id,
      winner_id, loser_id,
      winner_score, loser_score,
      elo_before_winner, elo_before_loser, elo_change,
      reported_by
    ) VALUES (
      ${data.match_type ?? "singles"},
      ${data.season_id}, ${data.group_id},
      ${data.winner_id}, ${data.loser_id},
      ${data.winner_score ?? 11}, ${data.loser_score ?? 5},
      ${data.elo_before_winner ?? 1000}, ${data.elo_before_loser ?? 1000},
      ${data.elo_change ?? 16},
      ${data.winner_id}
    )
    RETURNING id
  `;
  return rows[0];
}
