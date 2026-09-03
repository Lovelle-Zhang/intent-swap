import { Pool, type PoolClient } from "pg";

import type { SqlClient, SqlPool, SqlQueryResult } from "./sql";

class NodePostgresClient implements SqlClient {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.client.query<Row>(text, [...values]);
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  }

  release(): void {
    this.client.release();
  }
}

export function createNodePostgresPool(databaseUrl: string): SqlPool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    // The Supabase transaction pooler drops idle server connections, so keep the
    // client idle window short (well under the server's) and probe with TCP
    // keepalives to shed dead sockets before a request reuses them.
    idleTimeoutMillis: 5_000,
    keepAlive: true,
    allowExitOnIdle: true,
  });
  // Idle pooled clients can emit an async 'error' when the backend closes their
  // connection. Without a listener node-postgres rethrows it as an unhandled
  // exception that can crash the serverless instance; swallow it and let the
  // next connect() (with the transaction-level retry) recover.
  pool.on("error", () => {});
  return {
    async connect() {
      return new NodePostgresClient(await pool.connect());
    },
    async end() {
      await pool.end();
    },
  };
}
