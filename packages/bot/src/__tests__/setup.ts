import { beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { setConnection, closeConnection } from "@smashrank/db";
import { initI18n } from "@smashrank/core";

// Force English for tests
process.env.DEFAULT_LANG = "en";

let sql: postgres.Sql;

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
  await sql`TRUNCATE tournament_standings, tournament_participants, tournaments, player_achievements, matches, season_snapshots, seasons, group_members, groups, players CASCADE`;
}
