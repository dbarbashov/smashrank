import type postgres from "postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConnection, closeConnection } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

async function migrate(): Promise<void> {
  const sql = getConnection();

  // Ensure schema_migrations table exists
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Get already-applied versions
  const applied = await sql<{ version: number }[]>`
    SELECT version FROM schema_migrations ORDER BY version
  `;
  const appliedSet = new Set(applied.map((r) => r.version));

  // Read migration files, sorted by number
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (appliedSet.has(version)) {
      console.log(`  skip  ${file} (already applied)`);
      continue;
    }

    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    console.log(`  apply ${file}`);

    await sql.begin(async (tx) => {
      const txSql = tx as unknown as postgres.Sql;
      await txSql.unsafe(content);
      await txSql`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
  }

  console.log("Migrations complete.");
  await closeConnection();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
