import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../../db/migrations");

const MIGRATION_FILES = [
  "001_initial_schema.sql",
  "002_seed_achievements.sql",
  "003_doubles_columns.sql",
  "004_tournaments.sql",
  "005_per_group_stats.sql",
  "006_negative_achievements.sql",
  "007_upset_victim_achievement.sql",
  "008_player_avatars.sql",
];

export async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set for E2E tests");
  }

  const sql = postgres(url, { onnotice: () => {} });

  // Drop all tables first so migrations are idempotent
  await sql.unsafe(`
    DROP TABLE IF EXISTS tournament_standings CASCADE;
    DROP TABLE IF EXISTS tournament_participants CASCADE;
    DROP TABLE IF EXISTS player_achievements CASCADE;
    DROP TABLE IF EXISTS season_snapshots CASCADE;
    DROP TABLE IF EXISTS matches CASCADE;
    DROP TABLE IF EXISTS tournaments CASCADE;
    DROP TABLE IF EXISTS seasons CASCADE;
    DROP TABLE IF EXISTS group_members CASCADE;
    DROP TABLE IF EXISTS groups CASCADE;
    DROP TABLE IF EXISTS players CASCADE;
    DROP TABLE IF EXISTS achievement_definitions CASCADE;
  `);

  // Run migrations
  for (const file of MIGRATION_FILES) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    await sql.unsafe(content);
  }

  await sql.end();
}
