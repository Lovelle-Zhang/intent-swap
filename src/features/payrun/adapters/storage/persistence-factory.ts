import type { PayRunPersistence } from "../../application/ports";
import { PersistenceUnavailableError } from "./errors";
import { openLocalJsonPayRunStorage } from "./local-json-storage";
import { openPostgresPayRunStorage } from "./postgres/postgres-storage";
import type { SqlPool, TrustedProjectContext } from "./postgres/sql";

export type OpenPayRunPersistenceOptions =
  | {
      readonly profile: "local" | "test" | "offline";
      readonly storePath: string;
    }
  | {
      readonly profile: "hosted_sandbox";
      readonly databaseUrl: string | undefined;
      readonly context: TrustedProjectContext;
    };

export interface PayRunPersistenceFactoryDependencies {
  readonly createPostgresPool: (databaseUrl: string) => Promise<SqlPool> | SqlPool;
}

async function defaultPostgresPool(databaseUrl: string): Promise<SqlPool> {
  const { createNodePostgresPool } = await import("./postgres/pg-pool");
  return createNodePostgresPool(databaseUrl);
}

export async function openPayRunPersistence(
  options: OpenPayRunPersistenceOptions,
  dependencies: PayRunPersistenceFactoryDependencies = {
    createPostgresPool: defaultPostgresPool,
  },
): Promise<PayRunPersistence> {
  if (options.profile !== "hosted_sandbox") {
    return openLocalJsonPayRunStorage({ storePath: options.storePath });
  }
  if (!options.databaseUrl) {
    throw new PersistenceUnavailableError("Hosted Sandbox requires SUPABASE_DATABASE_URL");
  }
  let pool: SqlPool;
  try {
    pool = await dependencies.createPostgresPool(options.databaseUrl);
  } catch (error) {
    throw new PersistenceUnavailableError("Hosted Postgres initialization failed", { cause: error });
  }
  return openPostgresPayRunStorage({ pool, context: options.context });
}
