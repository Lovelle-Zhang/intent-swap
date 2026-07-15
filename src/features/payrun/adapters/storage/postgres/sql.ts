export interface SqlQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

export interface SqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
  end(): Promise<void>;
}

export interface TrustedProjectContext {
  readonly userId: string;
  readonly projectId: string;
}
