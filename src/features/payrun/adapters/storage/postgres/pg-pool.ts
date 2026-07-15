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
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  return {
    async connect() {
      return new NodePostgresClient(await pool.connect());
    },
    async end() {
      await pool.end();
    },
  };
}
