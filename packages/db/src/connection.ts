import postgres from "postgres";

let sql: postgres.Sql | undefined;

export function getConnection(): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    sql = postgres(url);
  }
  return sql;
}

export async function closeConnection(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = undefined;
  }
}
