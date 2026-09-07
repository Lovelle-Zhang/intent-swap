import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { PolicyRuleSnapshot } from "@/features/payrun/domain/types";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import { createWorkspaceApiKey } from "@/features/payrun/hosted/api-keys";
import { saveWorkspacePolicy, usdcMoney } from "@/features/payrun/hosted/workspace-policy";
import { getWorkspacePayRun, listWorkspacePayRuns } from "@/features/payrun/hosted/workspace-payruns";
import { loadHostedMigrationsSql } from "./hosted-migrations";

const USER = "00000000-0000-4000-8000-00000000000c";
const USER_BUDGET = "00000000-0000-4000-8000-00000000000d";
const USER_UNLIMITED = "00000000-0000-4000-8000-00000000000e";

// The route reads its Postgres pool from getHostedSqlPool(); point it at the
// PGlite test pool so the real route handler drives the real storage.
const holder = vi.hoisted(() => ({ pool: undefined as unknown as SqlPool }));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => holder.pool }));

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
  transactionLimit: usdcMoney("100000000"), // 100 USDC
  absoluteHardLimit: usdcMoney("1000000000"), // 1000 USDC
  reviewThreshold: usdcMoney("50000000"), // 50 USDC
  requireReviewForNewMerchant: true,
  allowedArtifactTypes: ["api_result"],
};

// Daily budget accumulation uses a fresh workspace with a high review threshold
// so amounts under it are allowed outright, letting the DERIVED spent-today drive
// the block instead of the review path.
const NO_REVIEW_RULES: PolicyRuleSnapshot = {
  allowedMerchantIds: ["acme_api"],
  blockedMerchantIds: [],
  blockedCategories: [],
  allowedRails: ["base"],
  transactionLimit: usdcMoney("1000000000"), // 1000 USDC
  absoluteHardLimit: usdcMoney("1000000000"), // 1000 USDC
  reviewThreshold: usdcMoney("1000000000"), // 1000 USDC — 60/500 stay below
  requireReviewForNewMerchant: false,
  allowedArtifactTypes: ["api_result"],
};

let db: PGlite;
let pool: Pool;
let apiKey: string;
let POST: (request: Request) => Promise<Response>;

function post(auth: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return POST(new Request("https://zenfix.test/api/v1/payruns", {
    method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

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

describe.sequential("POST /api/v1/payruns (real intake)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE ROLE zenfix_login LOGIN NOSUPERUSER NOBYPASSRLS;
      INSERT INTO auth.users VALUES ('${USER}'::uuid), ('${USER_BUDGET}'::uuid), ('${USER_UNLIMITED}'::uuid);
    `);
    await db.exec(await loadHostedMigrationsSql());
    await db.exec("GRANT zenfix_app TO zenfix_login");
    pool = new Pool(db);
    holder.pool = pool;
    await saveWorkspacePolicy(pool, identity, POLICY_RULES, "0");
    apiKey = (await createWorkspaceApiKey(pool, identity, "intake agent")).key;
    ({ POST } = await import("@/app/api/v1/payruns/route"));
  }, 60_000);

  afterAll(async () => db?.close());

  test("a 30 USDC intent to a known merchant is allowed and persisted with an audit trail", async () => {
    const response = await post(`Bearer ${apiKey}`, intent({ idempotencyKey: "case-allowed" }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.decision.outcome).toBe("allowed");
    expect(json.decision.checks.length).toBeGreaterThan(0);

    const detail = await getWorkspacePayRun(pool, identity, json.payRunId);
    expect(detail).not.toBeNull();
    expect(detail!.payRun.status).toBe("policy_allowed");
    expect(detail!.payRun.policyDecisions.at(-1)?.outcome).toBe("allowed");
    expect(detail!.auditEvents.length).toBeGreaterThanOrEqual(3);
  });

  test("an unknown merchant matches the real engine and the persisted status agrees", async () => {
    const response = await post(`Bearer ${apiKey}`, intent({
      idempotencyKey: "case-unknown",
      merchant: { id: "mystery_api", payee: "Mystery", category: "api" },
    }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(["allowed", "needs_review", "blocked"]).toContain(json.decision.outcome);

    const expectedStatus = { allowed: "policy_allowed", needs_review: "pending_review", blocked: "blocked" }[
      json.decision.outcome as "allowed" | "needs_review" | "blocked"
    ];
    const detail = await getWorkspacePayRun(pool, identity, json.payRunId);
    expect(detail!.payRun.status).toBe(expectedStatus);
  });

  test("a 60 USDC intent to a known merchant needs review and persists a pending Approval", async () => {
    const response = await post(`Bearer ${apiKey}`, intent({ idempotencyKey: "case-review", amount: "60" }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.decision.outcome).toBe("needs_review");

    const detail = await getWorkspacePayRun(pool, identity, json.payRunId);
    expect(detail!.payRun.status).toBe("pending_review");
    expect(detail!.payRun.approval?.status).toBe("pending");
  });

  test("a 5000 USDC intent is blocked for exceeding the hard limit", async () => {
    const response = await post(`Bearer ${apiKey}`, intent({ idempotencyKey: "case-blocked", amount: "5000" }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.decision.outcome).toBe("blocked");
    expect(json.decision.reasonCodes.length).toBeGreaterThan(0);

    const detail = await getWorkspacePayRun(pool, identity, json.payRunId);
    expect(detail!.payRun.status).toBe("blocked");
  });

  test("missing or garbage Authorization is 401 and persists nothing", async () => {
    const before = (await listWorkspacePayRuns(pool, identity)).payRuns.length;
    expect((await post(null, intent({}))).status).toBe(401);
    expect((await post("Bearer not-a-key", intent({}))).status).toBe(401);
    expect((await post(`Bearer zfk_live_${"z".repeat(32)}`, intent({}))).status).toBe(401);
    const after = (await listWorkspacePayRuns(pool, identity)).payRuns.length;
    expect(after).toBe(before);
  });

  test("a malformed body (missing amount) is 400", async () => {
    const response = await post(`Bearer ${apiKey}`, {
      agentId: "agent_ops_01", purpose: "x",
      merchant: { id: "acme_api", payee: "ACME", category: "api" }, artifactType: "api_result",
    });
    expect(response.status).toBe(400);
  });

  describe.sequential("daily budget accumulation", () => {
  const identityBudget: VerifiedAuthIdentity = { userId: USER_BUDGET };
  const identityUnlimited: VerifiedAuthIdentity = { userId: USER_UNLIMITED };
  let budgetKey: string;
  let unlimitedKey: string;

  beforeAll(async () => {
    await saveWorkspacePolicy(pool, identityBudget, NO_REVIEW_RULES, "100000000"); // 100 USDC/day
    budgetKey = (await createWorkspaceApiKey(pool, identityBudget, "budget agent")).key;
    await saveWorkspacePolicy(pool, identityUnlimited, NO_REVIEW_RULES, "0"); // unlimited
    unlimitedKey = (await createWorkspaceApiKey(pool, identityUnlimited, "unlimited agent")).key;
  });

  test("first 60 USDC intent is allowed (spends 60 of a 100 USDC daily budget)", async () => {
    const response = await post(`Bearer ${budgetKey}`, intent({ idempotencyKey: "budget-1", amount: "60" }));
    expect(response.status).toBe(200);
    expect((await response.json()).decision.outcome).toBe("allowed");
  });

  test("second 60 USDC intent is blocked — remaining 40 < 60 trips the project budget", async () => {
    const response = await post(`Bearer ${budgetKey}`, intent({ idempotencyKey: "budget-2", amount: "60" }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.decision.outcome).toBe("blocked");
    expect(json.decision.reasonCodes).toContain("budget.project_limit_exceeded");
  });

  test("a blocked run does not consume budget — a following 40 USDC intent is still allowed", async () => {
    const response = await post(`Bearer ${budgetKey}`, intent({ idempotencyKey: "budget-3", amount: "40" }));
    expect(response.status).toBe(200);
    expect((await response.json()).decision.outcome).toBe("allowed");
  });

  test("with an unlimited daily budget a large within-hard-limit intent stays allowed", async () => {
    const response = await post(`Bearer ${unlimitedKey}`, intent({ idempotencyKey: "unlimited-1", amount: "500" }));
    expect(response.status).toBe(200);
    expect((await response.json()).decision.outcome).toBe("allowed");
  });
  });
});
