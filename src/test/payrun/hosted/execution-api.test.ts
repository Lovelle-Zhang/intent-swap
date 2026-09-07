import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { PolicyRuleSnapshot } from "@/features/payrun/domain/types";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import { createWorkspaceApiKey } from "@/features/payrun/hosted/api-keys";
import { saveWorkspacePolicy, usdcMoney } from "@/features/payrun/hosted/workspace-policy";
import { getWorkspacePayRun } from "@/features/payrun/hosted/workspace-payruns";
import { loadHostedMigrationsSql } from "./hosted-migrations";

const USER = "00000000-0000-4000-8000-00000000000e";

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

function report(id: string, auth: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return EXEC_POST(
    new Request(`https://zenfix.test/api/v1/payruns/${id}/execution`, {
      method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: { id } },
  );
}

describe.sequential("POST /api/v1/payruns/:id/execution (execution report)", () => {
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
    await saveWorkspacePolicy(pool, identity, POLICY_RULES, "0");
    apiKey = (await createWorkspaceApiKey(pool, identity, "exec agent")).key;
    ({ POST: INTAKE_POST } = await import("@/app/api/v1/payruns/route"));
    ({ POST: EXEC_POST } = await import("@/app/api/v1/payruns/[id]/execution/route"));
  }, 60_000);

  afterAll(async () => db?.close());

  test("reports execution on an allowed run and moves it to execution_reported", async () => {
    const payRunId = await createRun({ idempotencyKey: "exec-allowed" });
    const before = (await getWorkspacePayRun(pool, identity, payRunId))!;
    expect(before.payRun.status).toBe("policy_allowed");
    const auditBefore = before.auditEvents.length;

    const response = await report(payRunId, `Bearer ${apiKey}`, {
      outcome: "executed", providerReference: "rail:txn:abc", transactionHash: "0xabc", rail: "base",
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("execution_reported");
    expect(json.report.outcome).toBe("executed");
    expect(json.report.providerReference).toBe("rail:txn:abc");

    const after = (await getWorkspacePayRun(pool, identity, payRunId))!;
    expect(after.payRun.status).toBe("execution_reported");
    expect(after.payRun.executionReport?.providerReference).toBe("rail:txn:abc");
    expect(after.payRun.executionReport?.transactionHash).toBe("0xabc");
    expect(after.auditEvents.length).toBe(auditBefore + 1);
  });

  test("a second report on the same run is 409", async () => {
    const payRunId = await createRun({ idempotencyKey: "exec-dup" });
    const first = await report(payRunId, `Bearer ${apiKey}`, {
      outcome: "executed", providerReference: "rail:txn:dup",
    });
    expect(first.status).toBe(200);
    const second = await report(payRunId, `Bearer ${apiKey}`, {
      outcome: "executed", providerReference: "rail:txn:dup2",
    });
    expect(second.status).toBe(409);
  });

  test("reporting on a blocked run is 409", async () => {
    const payRunId = await createRun({ idempotencyKey: "exec-blocked", amount: "5000" });
    const blocked = (await getWorkspacePayRun(pool, identity, payRunId))!;
    expect(blocked.payRun.status).toBe("blocked");
    const response = await report(payRunId, `Bearer ${apiKey}`, {
      outcome: "executed", providerReference: "rail:txn:x",
    });
    expect(response.status).toBe(409);
  });

  test("reporting on a nonexistent id is 404", async () => {
    const response = await report("payrun_does_not_exist", `Bearer ${apiKey}`, {
      outcome: "executed", providerReference: "rail:txn:x",
    });
    expect(response.status).toBe(404);
  });

  test("missing or garbage bearer is 401", async () => {
    const payRunId = await createRun({ idempotencyKey: "exec-auth" });
    expect((await report(payRunId, null, { outcome: "executed", providerReference: "r" })).status).toBe(401);
    expect((await report(payRunId, "Bearer not-a-key", { outcome: "executed", providerReference: "r" })).status).toBe(401);
  });

  test("a malformed body is 400", async () => {
    const payRunId = await createRun({ idempotencyKey: "exec-malformed" });
    expect((await report(payRunId, `Bearer ${apiKey}`, { providerReference: "r" })).status).toBe(400);
    expect((await report(payRunId, `Bearer ${apiKey}`, { outcome: "executed" })).status).toBe(400);
  });
});
