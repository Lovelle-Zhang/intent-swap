import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { PolicyRuleSnapshot } from "@/features/payrun/domain/types";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import { createWorkspaceApiKey } from "@/features/payrun/hosted/api-keys";
import { saveWorkspacePolicy, usdcMoney } from "@/features/payrun/hosted/workspace-policy";
import { getWorkspacePayRun } from "@/features/payrun/hosted/workspace-payruns";
import { loadHostedMigrationsSql } from "./hosted-migrations";

// e2e for the needs_review human-approval loop. Real Postgres (PGlite) drives
// intake -> pending_review, the signed-in owner review route -> approved|denied,
// and proves an approved run is then executable via the execution webhook.

const USER = "00000000-0000-4000-8000-00000000000e";

const holder = vi.hoisted(() => ({ pool: undefined as unknown as SqlPool }));
const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000e" } as { id: string } | null,
  error: null as Error | null,
}));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => holder.pool }));
vi.mock("@/features/payrun/adapters/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.error }) },
  }),
}));

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

const identity: VerifiedAuthIdentity = { userId: USER };
const POLICY_RULES: PolicyRuleSnapshot = {
  allowedMerchantIds: ["acme_api"],
  blockedMerchantIds: [],
  blockedCategories: [],
  allowedRails: ["base"],
  transactionLimit: usdcMoney("100000000"),
  absoluteHardLimit: usdcMoney("1000000000"),
  reviewThreshold: usdcMoney("50000000"),
  requireReviewForNewMerchant: true,
  allowedArtifactTypes: ["api_result"],
};

let db: PGlite;
let pool: Pool;
let apiKey: string;
let INTAKE_POST: (request: Request) => Promise<Response>;
let EXEC_POST: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;
let REVIEW_POST: (request: Request, ctx: { params: { id: string } }) => Promise<Response>;

function intent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    agentId: "agent_ops_01",
    purpose: "Buy a verified API result",
    amount: "30",
    merchant: { id: "acme_api", payee: "ACME", category: "api" },
    artifactType: "api_result",
    ...overrides,
  };
}

async function createRun(overrides: Record<string, unknown>): Promise<string> {
  const response = await INTAKE_POST(new Request("https://zenfix.test/api/v1/payruns", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(intent(overrides)),
  }));
  return (await response.json()).payRunId as string;
}

function review(id: string, action: string | null, returnTo?: string): Promise<Response> {
  const form = new FormData();
  if (action !== null) form.set("action", action);
  if (returnTo !== undefined) form.set("return", returnTo);
  return REVIEW_POST(
    new Request(`https://zenfix.test/zenfix/payruns/${id}/review`, { method: "POST", body: form }),
    { params: { id } },
  );
}

function report(id: string, body: unknown): Promise<Response> {
  return EXEC_POST(
    new Request(`https://zenfix.test/api/v1/payruns/${id}/execution`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

describe.sequential("POST /zenfix/payruns/:id/review (human approval loop)", () => {
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
    holder.pool = pool;
    await saveWorkspacePolicy(pool, identity, POLICY_RULES, "0", {});
    apiKey = (await createWorkspaceApiKey(pool, identity, "review agent")).key;
    ({ POST: INTAKE_POST } = await import("@/app/api/v1/payruns/route"));
    ({ POST: EXEC_POST } = await import("@/app/api/v1/payruns/[id]/execution/route"));
    ({ POST: REVIEW_POST } = await import("@/app/zenfix/payruns/[id]/review/route"));
  }, 60_000);

  beforeEach(() => {
    auth.user = { id: USER };
    auth.error = null;
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });

  afterAll(async () => { delete process.env.ZENFIX_APP_ORIGIN; await db?.close(); });

  test("owner approval authorizes an execution report on the approved run", async () => {
    const id = await createRun({ idempotencyKey: "review-approve", amount: "70" });
    const before = (await getWorkspacePayRun(pool, identity, id))!;
    expect(before.payRun.status).toBe("pending_review");
    expect(before.payRun.approval?.status).toBe("pending");

    const decided = await review(id, "approve");
    expect(decided.status).toBe(303);
    expect(decided.headers.get("location")).toBe(`https://zenfix.test/zenfix/payruns/${id}?status=approved`);

    const approved = (await getWorkspacePayRun(pool, identity, id))!;
    expect(approved.payRun.status).toBe("approved");
    expect(approved.payRun.approval?.status).toBe("approved");
    expect(approved.payRun.approval?.decision?.outcome).toBe("approved");
    expect(approved.payRun.approval?.decision?.reviewerId).toBe(USER);

    const executed = await report(id, { outcome: "executed", providerReference: "rail:txn:approved" });
    expect(executed.status).toBe(200);
    const after = (await getWorkspacePayRun(pool, identity, id))!;
    expect(after.payRun.status).toBe("execution_reported");
    expect(after.payRun.executionReport?.providerReference).toBe("rail:txn:approved");
  });

  test("owner denial is terminal and blocks execution", async () => {
    const id = await createRun({ idempotencyKey: "review-deny", amount: "70" });
    const denied = await review(id, "deny");
    expect(denied.status).toBe(303);
    expect(denied.headers.get("location")).toBe(`https://zenfix.test/zenfix/payruns/${id}?status=denied`);

    const run = (await getWorkspacePayRun(pool, identity, id))!;
    expect(run.payRun.status).toBe("denied");
    expect(run.payRun.approval?.decision?.outcome).toBe("denied");

    const executed = await report(id, { outcome: "executed", providerReference: "rail:txn:x" });
    expect(executed.status).toBe(409);
  });

  test("review on a non-pending run redirects with a not_pending notice", async () => {
    const id = await createRun({ idempotencyKey: "review-not-pending", amount: "30" });
    expect((await getWorkspacePayRun(pool, identity, id))!.payRun.status).toBe("policy_allowed");

    const response = await review(id, "approve");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://zenfix.test/zenfix/payruns/${id}?status=not_pending`);
    expect((await getWorkspacePayRun(pool, identity, id))!.payRun.status).toBe("policy_allowed");
  });

  test("a review without a signed-in owner redirects to sign-in", async () => {
    const id = await createRun({ idempotencyKey: "review-anon", amount: "70" });
    auth.user = null;
    const response = await review(id, "approve");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
    expect((await getWorkspacePayRun(pool, identity, id))!.payRun.status).toBe("pending_review");
  });

  test("an inline review from the Overview queue redirects back to Overview", async () => {
    const id = await createRun({ idempotencyKey: "review-return-overview", amount: "70" });
    const decided = await review(id, "approve", "overview");
    expect(decided.status).toBe(303);
    expect(decided.headers.get("location")).toBe("https://zenfix.test/zenfix/workspace");
    expect((await getWorkspacePayRun(pool, identity, id))!.payRun.status).toBe("approved");
  });

  test("an invalid action is rejected with 400", async () => {
    const id = await createRun({ idempotencyKey: "review-bad-action", amount: "70" });
    expect((await review(id, "maybe")).status).toBe(400);
    expect((await review(id, null)).status).toBe(400);
  });
});
