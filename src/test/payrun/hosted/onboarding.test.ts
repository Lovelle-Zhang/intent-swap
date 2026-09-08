import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import { resolvePersonalWorkspace } from "@/features/payrun/hosted/workspace";
import { createWorkspaceApiKey } from "@/features/payrun/hosted/api-keys";
import { DEFAULT_POLICY_RULES, saveWorkspacePolicy } from "@/features/payrun/hosted/workspace-policy";
import { getOnboardingState } from "@/features/payrun/hosted/onboarding";
import { renderOnboarding } from "@/features/payrun/hosted/onboarding-view";
import { loadHostedMigrationsSql } from "./hosted-migrations";

const USER = "00000000-0000-4000-8000-0000000000c1";

class Client implements SqlClient {
  constructor(private readonly db: PGlite) {}
  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string, values: readonly unknown[] = [],
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
const identity: VerifiedAuthIdentity = { userId: USER };

async function seedApiRun(projectId: string, id: string): Promise<void> {
  const document = {
    projectId, id, version: 1, status: "policy_allowed",
    intent: {
      agentId: "agent_ops_01", purpose: "from my agent", source: "api",
      quotedAmount: { amountAtomic: "1000000", asset: "USDC" }, createdAt: "2026-09-08T00:00:00.000Z",
    },
  };
  await db.exec("RESET ROLE;");
  await db.query(
    `INSERT INTO public.pay_runs (project_id, id, version, status, document)
     VALUES ($1::uuid, $2, 1, 'policy_allowed', $3::jsonb)`,
    [projectId, id, JSON.stringify(document)],
  );
}

describe.sequential("onboarding activation state", () => {
  let project: string;

  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE ROLE zenfix_login LOGIN NOSUPERUSER NOBYPASSRLS;
      INSERT INTO auth.users VALUES ('${USER}'::uuid);
    `);
    await db.exec(await loadHostedMigrationsSql());
    await db.exec("GRANT zenfix_app TO zenfix_login");
    pool = new Pool(db);
    project = (await resolvePersonalWorkspace(pool, identity)).projectId;
  }, 60_000);

  afterAll(async () => db?.close());

  test("a fresh workspace has all three steps incomplete", async () => {
    expect(await getOnboardingState(pool, identity)).toEqual({
      hasKey: false, hasPolicy: false, hasApiRun: false, complete: false,
    });
  });

  test("creating a key, saving a policy, and an api-source run each flip a step; then it completes", async () => {
    await createWorkspaceApiKey(pool, identity, "first key");
    expect(await getOnboardingState(pool, identity)).toMatchObject({ hasKey: true, hasPolicy: false, hasApiRun: false, complete: false });

    await saveWorkspacePolicy(pool, identity, DEFAULT_POLICY_RULES, "0", {});
    expect(await getOnboardingState(pool, identity)).toMatchObject({ hasKey: true, hasPolicy: true, hasApiRun: false, complete: false });

    await seedApiRun(project, "pr_api_1");
    expect(await getOnboardingState(pool, identity)).toEqual({ hasKey: true, hasPolicy: true, hasApiRun: true, complete: true });
  });
});

describe("renderOnboarding", () => {
  test("renders a 3-step checklist with progress while incomplete", () => {
    const html = renderOnboarding({ hasKey: true, hasPolicy: false, hasApiRun: false, complete: false });
    expect(html).toContain("Get started · 1/3");
    expect(html).toContain("Create an API key");
    expect(html).toContain("Set your policy");
    expect(html).toContain("first intent"); // title has an apostrophe → escaped in HTML
    expect(html).toContain("/api/v1/payruns"); // the copy-paste curl
  });
  test("is empty once complete", () => {
    expect(renderOnboarding({ hasKey: true, hasPolicy: true, hasApiRun: true, complete: true })).toBe("");
  });
});
