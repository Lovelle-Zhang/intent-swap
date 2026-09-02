import { ProjectScopeError } from "../../../domain/errors";
import {
  CommitOutcomeUnknownError,
  PersistenceUnavailableError,
  UnsafeDatabaseRoleError,
} from "../errors";
import type { SqlClient, SqlPool } from "./sql";

interface RoleRow extends Record<string, unknown> {
  readonly role_name: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export function isPostgresConnectionFailure(error: unknown): boolean {
  const code = errorCode(error);
  if (code && (code.startsWith("08") || [
    "ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03",
  ].includes(code))) return true;
  return error instanceof Error && [
    "Connection terminated",
    "Connection terminated unexpectedly",
  ].includes(error.message);
}

async function assertSafeSessionRole(client: SqlClient): Promise<string> {
  const result = await client.query<RoleRow>(
    `SELECT session_user AS role_name, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = session_user`,
  );
  const role = result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.role_name === "service_role") {
    throw new UnsafeDatabaseRoleError(role?.role_name ?? "unknown");
  }
  return role.role_name;
}

export interface HostedTransactionOptions {
  readonly pool: SqlPool;
  readonly userId: string;
  readonly requireProjectId?: string;
}

export async function withHostedTransaction<T>(
  options: HostedTransactionOptions,
  operation: (client: SqlClient) => Promise<T>,
): Promise<T> {
  let client: SqlClient;
  try {
    client = await options.pool.connect();
  } catch (error) {
    throw new PersistenceUnavailableError("Hosted Postgres connection is unavailable", { cause: error });
  }

  let loginRole = "unknown";
  let phase: "begin" | "session_role" | "assume_role" | "context" | "operation" | "commit" = "begin";
  try {
    await client.query("BEGIN");
    phase = "session_role";
    loginRole = await assertSafeSessionRole(client);
    phase = "assume_role";
    try {
      await client.query("SET LOCAL ROLE zenfix_app");
    } catch (error) {
      if (isPostgresConnectionFailure(error)) throw error;
      throw new UnsafeDatabaseRoleError(loginRole, "Database login role cannot assume zenfix_app");
    }
    const effectiveResult = await client.query<RoleRow>(
      `SELECT current_user AS role_name, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
    );
    const effective = effectiveResult.rows[0];
    if (!effective || effective.role_name !== "zenfix_app" || effective.rolsuper || effective.rolbypassrls) {
      throw new UnsafeDatabaseRoleError(effective?.role_name ?? "unknown");
    }
    phase = "context";
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [options.userId]);
    if (options.requireProjectId) {
      const owned = await client.query(
        "SELECT id FROM public.projects WHERE id = $1::uuid",
        [options.requireProjectId],
      );
      if (owned.rowCount !== 1) throw new ProjectScopeError(options.requireProjectId, "not_visible");
    }
    phase = "operation";
    const result = await operation(client);
    phase = "commit";
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    if (phase === "commit" && isPostgresConnectionFailure(error)) {
      throw new CommitOutcomeUnknownError({ cause: error });
    }
    if (isPostgresConnectionFailure(error)) {
      throw new PersistenceUnavailableError("Hosted Postgres transaction connection was lost", { cause: error });
    }
    throw error;
  } finally {
    client.release();
  }
}
