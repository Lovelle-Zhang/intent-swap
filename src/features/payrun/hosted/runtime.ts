import { PersistenceUnavailableError } from "../adapters/storage";
import { createNodePostgresPool } from "../adapters/storage/postgres/pg-pool";
import type { SqlPool } from "../adapters/storage/postgres/sql";

let pool: SqlPool | undefined;

export function getHostedSqlPool(env: NodeJS.ProcessEnv = process.env): SqlPool {
  if (pool) return pool;
  const databaseUrl = env.SUPABASE_DATABASE_URL;
  if (!databaseUrl) throw new PersistenceUnavailableError("SUPABASE_DATABASE_URL is missing");
  pool = createNodePostgresPool(databaseUrl);
  return pool;
}
