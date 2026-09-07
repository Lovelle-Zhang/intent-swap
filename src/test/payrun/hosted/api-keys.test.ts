import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import {
  createWorkspaceApiKey,
  isWellFormedApiKey,
  listWorkspaceApiKeys,
  resolveApiKeyIdentity,
  revokeWorkspaceApiKey,
} from "@/features/payrun/hosted/api-keys";
import { loadHostedMigrationsSql } from "./hosted-migrations";

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

describe.sequential("workspace API keys", () => {
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
    await db.exec(await loadHostedMigrationsSql());
    await db.exec("GRANT zenfix_app TO zenfix_login");
    pool = new Pool(db);
  }, 60_000);

  afterAll(async () => db?.close());

  test("isWellFormedApiKey guards the zfk_live_ shape", () => {
    expect(isWellFormedApiKey("zfk_live_abcdefghijklmnopqrstuvwx")).toBe(true);
    expect(isWellFormedApiKey("zfk_live_short")).toBe(false);
    expect(isWellFormedApiKey("sk_live_whatever_zzzzzzzzzzzzzzzz")).toBe(false);
    expect(isWellFormedApiKey(null)).toBe(false);
  });

  test("a created key is shown once, listed by prefix, and resolves to its owner", async () => {
    const created = await createWorkspaceApiKey(pool, identity(USER_A), "prod agent");
    expect(created.key.startsWith("zfk_live_")).toBe(true);
    expect(created.view.label).toBe("prod agent");
    expect(created.view.revokedAt).toBeNull();

    const keys = await listWorkspaceApiKeys(pool, identity(USER_A));
    expect(keys).toHaveLength(1);
    expect(keys[0].prefix.startsWith("zfk_live_")).toBe(true);
    // the listed prefix is a truncation, never the full secret
    expect(created.key.startsWith(keys[0].prefix)).toBe(true);
    expect(keys[0].prefix.length).toBeLessThan(created.key.length);

    const resolved = await resolveApiKeyIdentity(pool, created.key);
    expect(resolved).toEqual({ userId: USER_A });

    // last_used_at gets stamped by the resolver
    const afterUse = await listWorkspaceApiKeys(pool, identity(USER_A));
    expect(afterUse[0].lastUsedAt).toEqual(expect.any(String));
  });

  test("garbage and unknown keys resolve to null", async () => {
    expect(await resolveApiKeyIdentity(pool, "not-a-key")).toBeNull();
    expect(await resolveApiKeyIdentity(pool, `zfk_live_${"z".repeat(32)}`)).toBeNull();
  });

  test("a revoked key no longer resolves", async () => {
    const created = await createWorkspaceApiKey(pool, identity(USER_A), "to revoke");
    expect(await resolveApiKeyIdentity(pool, created.key)).toEqual({ userId: USER_A });

    const revoked = await revokeWorkspaceApiKey(pool, identity(USER_A), created.view.id);
    expect(revoked).toBe(true);
    expect(await resolveApiKeyIdentity(pool, created.key)).toBeNull();

    const keys = await listWorkspaceApiKeys(pool, identity(USER_A));
    const row = keys.find((k) => k.id === created.view.id);
    expect(row?.revokedAt).toEqual(expect.any(String));
  });

  test("keys are private to their owner — another user cannot see or revoke them", async () => {
    const created = await createWorkspaceApiKey(pool, identity(USER_A), "a-only");

    const bKeys = await listWorkspaceApiKeys(pool, identity(USER_B));
    expect(bKeys.every((k) => k.label !== "a-only")).toBe(true);

    const revokedByB = await revokeWorkspaceApiKey(pool, identity(USER_B), created.view.id);
    expect(revokedByB).toBe(false);
    // still valid for A
    expect(await resolveApiKeyIdentity(pool, created.key)).toEqual({ userId: USER_A });
  });
});
