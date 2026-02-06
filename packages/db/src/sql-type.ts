import type postgres from "postgres";

/**
 * Accepts both postgres.Sql and postgres.TransactionSql.
 * TransactionSql loses call signatures through Omit, so we use Sql
 * and cast at the call site when passing a TransactionSql.
 */
export type SqlLike = postgres.Sql;
