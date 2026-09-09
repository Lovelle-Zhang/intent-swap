import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { SqlClient, SqlPool, SqlQueryResult } from "@/features/payrun/adapters/storage/postgres/sql";
import type { VerifiedAuthIdentity } from "@/features/payrun/hosted/workspace";
import { resolvePersonalWorkspace } from "@/features/payrun/hosted/workspace";
import { getOverviewStats } from "@/features/payrun/hosted/workspace-overview";
import { getSpendHistory } from "@/features/payrun/hosted/spend-history";
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

// Insert a pay_runs row directly as the migration owner (RESET ROLE), building a
// document that satisfies pay_runs_document_identity and carries the intent
// fields the Overview read model projects.
async function seedRun(
  projectId: string,
  id: string,
  status: string,
  intent: { agentId: string; purpose: string; amountAtomic: string; asset: string; createdAt: string },
): Promise<void> {
  const document = {
    projectId, id, version: 1, status,
    intent: {
      agentId: intent.agentId,
      purpose: intent.purpose,
      quotedAmount: { amountAtomic: intent.amountAtomic, asset: intent.asset },
      createdAt: intent.createdAt,
    },
  };
  await db.exec("RESET ROLE;");
  await db.query(
    `INSERT INTO public.pay_runs (project_id, id, version, status, document)
     VALUES ($1::uuid, $2, 1, $3, $4::jsonb)`,
    [projectId, id, status, JSON.stringify(document)],
  );
}

describe.sequential("workspace overview read model", () => {
  let projectA: string;
  let projectB: string;

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

    projectA = (await resolvePersonalWorkspace(pool, identity(USER_A))).projectId;
    projectB = (await resolvePersonalWorkspace(pool, identity(USER_B))).projectId;

    const base = { asset: "USDC", createdAt: "2026-09-07T08:00:00.000Z" };
    await seedRun(projectA, "pr_allowed_1", "policy_allowed", { agentId: "agent_a", purpose: "Allowed one", amountAtomic: "1000000", ...base });
    await seedRun(projectA, "pr_allowed_2", "policy_allowed", { agentId: "agent_a", purpose: "Allowed two", amountAtomic: "2000000", ...base });
    await seedRun(projectA, "pr_review_1", "pending_review", { agentId: "agent_review", purpose: "Please review me", amountAtomic: "12500000", ...base });
    await seedRun(projectA, "pr_blocked_1", "blocked", { agentId: "agent_a", purpose: "Blocked one", amountAtomic: "9000000", ...base });
    await seedRun(projectA, "pr_denied_1", "denied", { agentId: "agent_a", purpose: "Denied one", amountAtomic: "9000000", ...base });
    await seedRun(projectA, "pr_exec_1", "execution_reported", { agentId: "agent_a", purpose: "Executed one", amountAtomic: "3000000", ...base });
    // Ignored status: must not land in any bucket.
    await seedRun(projectA, "pr_completed_1", "completed", { agentId: "agent_a", purpose: "Completed", amountAtomic: "3000000", ...base });
    // Second workspace's rows — must not leak into USER_A's overview.
    await seedRun(projectB, "pr_b_allowed", "policy_allowed", { agentId: "agent_b", purpose: "B allowed", amountAtomic: "5000000", ...base });
    await seedRun(projectB, "pr_b_review", "pending_review", { agentId: "agent_b", purpose: "B review", amountAtomic: "5000000", ...base });
  }, 60_000);

  afterAll(async () => db?.close());

  test("buckets today's runs and lists the pending-review queue, scoped to the workspace", async () => {
    const stats = await getOverviewStats(pool, identity(USER_A));

    expect(stats.today).toEqual({ allowed: 2, needsReview: 1, blocked: 2, executed: 1 });

    expect(stats.pendingReview).toHaveLength(1);
    expect(stats.pendingReview[0]).toEqual({
      payRunId: "pr_review_1",
      agentId: "agent_review",
      purpose: "Please review me",
      amountAtomic: "12500000",
      asset: "USDC",
      createdAt: "2026-09-07T08:00:00.000Z",
    });
  });

  test("breaks down today's runs per agent: authorized spend and decision counts", async () => {
    const stats = await getOverviewStats(pool, identity(USER_A));
    // Sorted by authorized spend desc. agent_a: allowed 1+2 + executed 3 = 6 USDC
    // authorized; blocked+denied = 2 blocked; the 'completed' run is ignored.
    expect(stats.byAgent).toEqual([
      { agentId: "agent_a", authorizedAtomic: "6000000", allowed: 2, needsReview: 0, blocked: 2, executed: 1 },
      { agentId: "agent_review", authorizedAtomic: "0", allowed: 0, needsReview: 1, blocked: 0, executed: 0 },
    ]);
  });

  test("spend history sums only authorized runs per day, scoped to the workspace", async () => {
    // All seeded rows land on today's created_at (now()). Authorized = the two
    // policy_allowed (1+2) + the execution_reported (3) = 6 USDC over 3 runs;
    // pending/blocked/denied/completed do not count.
    const history = await getSpendHistory(pool, identity(USER_A), 7);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ authorizedAtomic: "6000000", count: 3 });
    // Another workspace sees only its own authorized spend (5 USDC, 1 run).
    const other = await getSpendHistory(pool, identity(USER_B), 7);
    expect(other[0]).toMatchObject({ authorizedAtomic: "5000000", count: 1 });
  });

  test("another workspace's runs do not leak", async () => {
    const stats = await getOverviewStats(pool, identity(USER_B));
    expect(stats.today).toEqual({ allowed: 1, needsReview: 1, blocked: 0, executed: 0 });
    expect(stats.pendingReview.map((r) => r.payRunId)).toEqual(["pr_b_review"]);
  });
});
