import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import {
  openWorkspacePersistence,
  resolvePersonalWorkspace,
  type VerifiedAuthIdentity,
} from "@/features/payrun/hosted/workspace";
import { buildIdempotencyRecord } from "@/test/payrun/domain/fixtures";

const migrationPath = fileURLToPath(
  new URL("../../../../supabase/migrations/202607150001_hosted_project_and_payrun_storage.sql", import.meta.url),
);
const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

class Client implements SqlClient {
  constructor(private readonly db: PGlite) {}
  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    if (text.includes("session_user AS role_name")) {
      return { rows: [{ role_name: "zenfix_login", rolsuper: false, rolbypassrls: false } as unknown as Row], rowCount: 1 };
    }
    const result = await this.db.query<Row>(text, [...values]);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  }
  release() {}
}

class Pool implements SqlPool {
  private tail = Promise.resolve();
  constructor(private readonly db: PGlite) {}
  async connect(): Promise<SqlClient> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    await this.db.exec("RESET ROLE; SET ROLE zenfix_login;");
    const client = new Client(this.db);
    const original = client.release.bind(client);
    client.release = () => { original(); release(); };
    return client;
  }
  async end() {}
}

let db: PGlite;
let pool: Pool;
const identity = (userId: string): VerifiedAuthIdentity => ({ userId });

describe.sequential("personal workspace bootstrap", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE ROLE zenfix_login LOGIN NOSUPERUSER NOBYPASSRLS;
      INSERT INTO auth.users VALUES ('${USER_A}'::uuid), ('${USER_B}'::uuid);
    `);
    await db.exec(await readFile(migrationPath, "utf8"));
    await db.exec("GRANT zenfix_app TO zenfix_login");
    pool = new Pool(db);
  }, 60_000);

  afterAll(async () => db?.close());

  test("verified user creates one persistent Personal Workspace and queued bootstrap calls resolve it", async () => {
    const first = await resolvePersonalWorkspace(pool, identity(USER_A));
    const repeated = await resolvePersonalWorkspace(pool, identity(USER_A));
    const [concurrentA, concurrentB] = await Promise.all([
      resolvePersonalWorkspace(pool, identity(USER_A)),
      resolvePersonalWorkspace(pool, identity(USER_A)),
    ]);
    expect(first).toEqual({ projectId: expect.any(String), name: "Personal Workspace", mode: "sandbox" });
    expect(repeated.projectId).toBe(first.projectId);
    expect(concurrentA.projectId).toBe(first.projectId);
    expect(concurrentB.projectId).toBe(first.projectId);
    const opened = await openWorkspacePersistence(pool, identity(USER_A));
    expect(opened.workspace.projectId).toBe(first.projectId);
    expect(opened.persistence.backend).toBe("postgres");
    await opened.persistence.close();
  });

  test("logout/login reconstruction preserves the workspace and its hosted repository data", async () => {
    const first = await openWorkspacePersistence(pool, identity(USER_A));
    const record = buildIdempotencyRecord({
      id: "idempotency_relogin_001",
      projectId: first.workspace.projectId,
      key: "relogin-workspace-record",
    });
    await first.persistence.idempotency.insert(first.workspace.projectId, record);
    await first.persistence.close();

    const afterRelogin = await openWorkspacePersistence(pool, identity(USER_A));
    expect(afterRelogin.workspace.projectId).toBe(first.workspace.projectId);
    await expect(afterRelogin.persistence.idempotency.get(
      afterRelogin.workspace.projectId,
      record.commandType,
      record.key,
    )).resolves.toEqual(record);
    await afterRelogin.persistence.close();

    const userB = await openWorkspacePersistence(pool, identity(USER_B));
    await expect(userB.persistence.idempotency.get(
      userB.workspace.projectId,
      record.commandType,
      record.key,
    )).resolves.toBeNull();
    await userB.persistence.close();
  });

  test("different verified users resolve different workspaces and cannot read each other", async () => {
    const a = await resolvePersonalWorkspace(pool, identity(USER_A));
    const b = await resolvePersonalWorkspace(pool, identity(USER_B));
    expect(b.projectId).not.toBe(a.projectId);
    await db.exec("RESET ROLE; SET ROLE zenfix_app;");
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [USER_B]);
    expect((await db.query("SELECT id FROM public.projects WHERE id = $1::uuid", [a.projectId])).rows).toEqual([]);
  });

  test("connection unavailability is typed and never falls back locally", async () => {
    const unavailable: SqlPool = {
      connect: async () => { throw new Error("offline"); },
      end: async () => undefined,
    };
    await expect(resolvePersonalWorkspace(unavailable, identity(USER_A)))
      .rejects.toBeInstanceOf(PersistenceUnavailableError);
  });
});
