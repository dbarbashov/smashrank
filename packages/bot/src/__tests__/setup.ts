import { beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setConnection, closeConnection } from "@smashrank/db";
import { initI18n } from "@smashrank/core";

// Force English for tests
process.env.DEFAULT_LANG = "en";

let sql: postgres.Sql;

const MIGRATIONS_DIR = join(__dirname, "../../../db/migrations");

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set for E2E tests");
  }

  sql = postgres(url);
  setConnection(sql);

  await initI18n();
});

afterAll(async () => {
  await closeConnection();
});

export async function cleanDb(): Promise<void> {
  await sql`TRUNCATE player_achievements, matches, season_snapshots, seasons, group_members, groups, players CASCADE`;
  // Re-seed achievements
  await sql`DELETE FROM achievement_definitions WHERE true`;
  const seed = readFileSync(join(MIGRATIONS_DIR, "002_seed_achievements.sql"), "utf-8");
  await sql.unsafe(seed);
}
