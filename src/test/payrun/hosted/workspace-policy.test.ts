import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import {
  DEFAULT_POLICY_RULES,
  getWorkspacePolicy,
  saveWorkspacePolicy,
  usdcMoney,
} from "@/features/payrun/hosted/workspace-policy";
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

describe.sequential("workspace policy persistence", () => {
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

  test("a workspace with no saved policy reads the defaults at version 0", async () => {
    const view = await getWorkspacePolicy(pool, identity(USER_A));
    expect(view).toEqual({ rules: DEFAULT_POLICY_RULES, version: 0, updatedAt: null, dailyBudgetAtomic: "0" });
  });

  test("saving persists the rules, advances the version, and reads back", async () => {
    const edited = {
      ...DEFAULT_POLICY_RULES,
      transactionLimit: usdcMoney("250000000"),
      allowedMerchantIds: ["merchant_known"],
      blockedCategories: ["gambling"],
      requireReviewForNewMerchant: false,
    };
    const saved = await saveWorkspacePolicy(pool, identity(USER_A), edited, "0");
    expect(saved.rules).toEqual(edited);
    expect(saved.version).toBe(1);
    expect(saved.updatedAt).toEqual(expect.any(String));
    expect(saved.dailyBudgetAtomic).toBe("0");

    const reread = await getWorkspacePolicy(pool, identity(USER_A));
    expect(reread.rules).toEqual(edited);
    expect(reread.version).toBe(1);

    const again = await saveWorkspacePolicy(pool, identity(USER_A), DEFAULT_POLICY_RULES, "0");
    expect(again.version).toBe(2);
    expect(again.rules).toEqual(DEFAULT_POLICY_RULES);
  });

  test("a daily budget round-trips through save and read", async () => {
    const saved = await saveWorkspacePolicy(pool, identity(USER_A), DEFAULT_POLICY_RULES, "100000000");
    expect(saved.dailyBudgetAtomic).toBe("100000000");

    const reread = await getWorkspacePolicy(pool, identity(USER_A));
    expect(reread.dailyBudgetAtomic).toBe("100000000");
  });

  test("a policy is private to its workspace — another user reads only their own defaults", async () => {
    await saveWorkspacePolicy(pool, identity(USER_A), {
      ...DEFAULT_POLICY_RULES,
      allowedMerchantIds: ["merchant_secret_to_a"],
    }, "0");

    const bView = await getWorkspacePolicy(pool, identity(USER_B));
    expect(bView.version).toBe(0);
    expect(bView.rules.allowedMerchantIds).toEqual([]);

    await db.exec("RESET ROLE; SET ROLE zenfix_app;");
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [USER_B]);
    const leaked = await db.query("SELECT project_id FROM public.policies");
    expect(leaked.rows).toEqual([]);
  });
});
