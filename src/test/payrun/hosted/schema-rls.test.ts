import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../../supabase/migrations/202607150001_hosted_project_and_payrun_storage.sql", import.meta.url),
);

const USER_A_ID = "00000000-0000-4000-8000-00000000000a";
const USER_B_ID = "00000000-0000-4000-8000-00000000000b";
const PROJECT_A_ID = "10000000-0000-4000-8000-00000000000a";
const PROJECT_B_ID = "10000000-0000-4000-8000-00000000000b";

let db: PGlite;

async function asApplicationUser(userId: string | null): Promise<void> {
  await db.exec("RESET ROLE");
  await db.exec("SET ROLE zenfix_app");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
}

async function asMigrationOwner(): Promise<void> {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
}

async function insertProject(projectId: string, ownerUserId: string, name: string): Promise<void> {
  await db.query(
    `INSERT INTO public.projects (id, owner_user_id, name)
     VALUES ($1::uuid, $2::uuid, $3)`,
    [projectId, ownerUserId, name],
  );
}

function payRunDocument(projectId: string, id: string, version = 1, status = "pending_review") {
  return { id, projectId, version, status };
}

async function insertPayRun(projectId: string, id: string): Promise<void> {
  await db.query(
    `INSERT INTO public.pay_runs
       (project_id, id, version, status, document)
     VALUES ($1::uuid, $2, 1, 'pending_review', $3::jsonb)`,
    [projectId, id, JSON.stringify(payRunDocument(projectId, id))],
  );
}

describe.sequential("hosted Postgres schema and RLS contract", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      INSERT INTO auth.users (id) VALUES
        ('${USER_A_ID}'::uuid),
        ('${USER_B_ID}'::uuid);
    `);

    const migration = await readFile(migrationPath, "utf8");
    await db.exec(migration);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  test("request role is non-superuser and cannot bypass RLS", async () => {
    await asMigrationOwner();
    const result = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'zenfix_app'`,
    );

    expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);

    const ownership = await db.query<{ tableowner: string }>(
      "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pay_runs'",
    );
    expect(ownership.rows).not.toEqual([{ tableowner: "zenfix_app" }]);

    await asApplicationUser(USER_A_ID);
    await expect(db.query("SELECT id FROM auth.users")).rejects.toThrow(/permission denied/i);
  });

  test("every tenant table forces RLS and has a required project scope", async () => {
    await asMigrationOwner();
    const tenantTables = [
      "pay_runs",
      "approvals",
      "budget_reservations",
      "funding_preparations",
      "payment_executions",
      "ledger_journals",
      "ledger_entries",
      "audit_events",
      "domain_outbox_events",
      "idempotency_records",
      "inbox_events",
    ];
    const tableResult = await db.query<{
      tablename: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname AS tablename, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [tenantTables],
    );
    expect(tableResult.rows).toHaveLength(tenantTables.length);
    expect(tableResult.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);

    const nullableScopes = await db.query(
      `SELECT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
         AND column_name = 'project_id'
         AND is_nullable <> 'NO'`,
      [tenantTables],
    );
    expect(nullableScopes.rows).toEqual([]);

    const broadPolicies = await db.query(
      `SELECT policyname
       FROM pg_policies
       WHERE schemaname = 'public'
         AND ('authenticated' = ANY(roles) OR 'public' = ANY(roles))`,
    );
    expect(broadPolicies.rows).toEqual([]);
  });

  test("owner can create and read exactly one personal workspace", async () => {
    await asApplicationUser(USER_A_ID);
    await insertProject(PROJECT_A_ID, USER_A_ID, "A personal workspace");

    const ownProjects = await db.query<{ id: string }>("SELECT id::text FROM public.projects");
    expect(ownProjects.rows).toEqual([{ id: PROJECT_A_ID }]);

    await expect(
      insertProject("10000000-0000-4000-8000-00000000000c", USER_A_ID, "Second workspace"),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  test("another user cannot read, mutate, or forge ownership of project A data", async () => {
    await asApplicationUser(USER_A_ID);
    await insertPayRun(PROJECT_A_ID, "payrun-a");

    await asApplicationUser(USER_B_ID);
    await insertProject(PROJECT_B_ID, USER_B_ID, "B personal workspace");

    const visibleProjects = await db.query<{ id: string }>("SELECT id::text FROM public.projects");
    const visiblePayRuns = await db.query<{ id: string }>("SELECT id FROM public.pay_runs");
    expect(visibleProjects.rows).toEqual([{ id: PROJECT_B_ID }]);
    expect(visiblePayRuns.rows).toEqual([]);

    await db.query(
      "UPDATE public.pay_runs SET status = 'blocked' WHERE project_id = $1::uuid AND id = 'payrun-a'",
      [PROJECT_A_ID],
    );
    await expect(insertPayRun(PROJECT_A_ID, "forged-payrun")).rejects.toThrow(
      /row-level security|policy/i,
    );

    await asApplicationUser(USER_A_ID);
    const unchanged = await db.query<{ status: string }>(
      "SELECT status FROM public.pay_runs WHERE project_id = $1::uuid AND id = 'payrun-a'",
      [PROJECT_A_ID],
    );
    expect(unchanged.rows).toEqual([{ status: "pending_review" }]);
  });

  test("anonymous request context cannot access tenant data", async () => {
    await asApplicationUser(null);
    expect((await db.query("SELECT id FROM public.projects")).rows).toEqual([]);
    expect((await db.query("SELECT id FROM public.pay_runs")).rows).toEqual([]);
    await expect(
      insertProject("10000000-0000-4000-8000-00000000000d", USER_A_ID, "Forged anonymous"),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  test("stale aggregate version cannot perform a CAS update", async () => {
    await asApplicationUser(USER_A_ID);
    await db.query(
      `UPDATE public.pay_runs
       SET version = 2,
           status = 'approved',
           document = $1::jsonb,
           updated_at = transaction_timestamp()
       WHERE project_id = $2::uuid
         AND id = 'payrun-a'
         AND version = 1
         AND status = 'pending_review'`,
      [JSON.stringify(payRunDocument(PROJECT_A_ID, "payrun-a", 2, "approved")), PROJECT_A_ID],
    );

    await db.query(
      `UPDATE public.pay_runs
       SET version = 2, status = 'blocked', document = $1::jsonb
       WHERE project_id = $2::uuid
         AND id = 'payrun-a'
         AND version = 1
         AND status = 'pending_review'`,
      [JSON.stringify(payRunDocument(PROJECT_A_ID, "payrun-a", 2, "blocked")), PROJECT_A_ID],
    );

    const result = await db.query<{ version: number; status: string }>(
      "SELECT version, status FROM public.pay_runs WHERE project_id = $1::uuid AND id = 'payrun-a'",
      [PROJECT_A_ID],
    );
    expect(result.rows).toEqual([{ version: 2, status: "approved" }]);

    await expect(
      db.query(
        `UPDATE public.pay_runs
         SET version = 4,
             status = 'blocked',
             document = $1::jsonb,
             updated_at = transaction_timestamp()
         WHERE project_id = $2::uuid AND id = 'payrun-a'`,
        [JSON.stringify(payRunDocument(PROJECT_A_ID, "payrun-a", 4, "blocked")), PROJECT_A_ID],
      ),
    ).rejects.toThrow(/version must advance exactly once/i);
  });

  test("audit rows are append-only for the request role", async () => {
    await asApplicationUser(USER_A_ID);
    await db.query(
      `INSERT INTO public.audit_events
        (project_id, id, pay_run_id, aggregate_type, aggregate_id, sequence,
         before_version, after_version, actor_id, actor_type, action_code,
         reason_code, idempotency_key, correlation_id, details)
       VALUES
        ($1::uuid, 'audit-a-1', 'payrun-a', 'PayRun', 'payrun-a', 1,
         1, 2, $2, 'user', 'payrun.approved', 'approved', 'approve-a',
         'correlation-a', '{}'::jsonb)`,
      [PROJECT_A_ID, USER_A_ID],
    );

    await expect(
      db.query(
        "UPDATE public.audit_events SET reason_code = 'tampered' WHERE project_id = $1::uuid",
        [PROJECT_A_ID],
      ),
    ).rejects.toThrow(/permission denied|immutable/i);
    await expect(
      db.query("DELETE FROM public.audit_events WHERE project_id = $1::uuid", [PROJECT_A_ID]),
    ).rejects.toThrow(/permission denied|immutable/i);
  });

  test("audit aggregate identity must match its foreign-keyed PayRun", async () => {
    await asApplicationUser(USER_A_ID);
    await expect(
      db.query(
        `INSERT INTO public.audit_events
          (project_id, id, pay_run_id, aggregate_type, aggregate_id, sequence,
           before_version, after_version, actor_id, actor_type, action_code,
           reason_code, idempotency_key, correlation_id, details)
         VALUES
          ($1::uuid, 'audit-mismatched-aggregate', 'payrun-a', 'PayRun',
           'payrun-b', 1, 2, 3, $2, 'user', 'payrun.transitioned',
           'invalid_aggregate', 'audit-mismatch', 'correlation-mismatch', '{}'::jsonb)`,
        [PROJECT_A_ID, USER_A_ID],
      ),
    ).rejects.toThrow(/audit_events_aggregate_identity|check constraint/i);
  });

  test("audit versions must advance exactly once", async () => {
    await asApplicationUser(USER_A_ID);
    await expect(
      db.query(
        `INSERT INTO public.audit_events
          (project_id, id, pay_run_id, aggregate_type, aggregate_id, sequence,
           before_version, after_version, actor_id, actor_type, action_code,
           reason_code, idempotency_key, correlation_id, details)
         VALUES
          ($1::uuid, 'audit-version-jump', 'payrun-a', 'PayRun', 'payrun-a',
           2, 2, 4, $2, 'user', 'payrun.transitioned', 'invalid_version_jump',
           'audit-version-jump', 'correlation-version-jump', '{}'::jsonb)`,
        [PROJECT_A_ID, USER_A_ID],
      ),
    ).rejects.toThrow(/audit_events_contiguous_versions|check constraint/i);
  });

  test("outbox and idempotency uniqueness is project scoped", async () => {
    await asApplicationUser(USER_A_ID);
    const outboxValues = [
      PROJECT_A_ID,
      "outbox-a-1",
      "payrun-a",
      JSON.stringify({ id: "payrun-a", projectId: PROJECT_A_ID, version: 2 }),
    ];
    const insertOutbox = () =>
      db.query(
        `INSERT INTO public.domain_outbox_events
          (project_id, id, aggregate_type, aggregate_id, aggregate_version,
           sequence, event_type, schema_version, payload)
         VALUES ($1::uuid, $2, 'PayRun', $3, 2, 1, 'payrun.transitioned', 1, $4::jsonb)`,
        outboxValues,
      );
    await insertOutbox();
    await expect(insertOutbox()).rejects.toThrow(/unique|duplicate/i);
    await expect(
      db.query(
        "UPDATE public.domain_outbox_events SET event_type = 'payrun.created' WHERE project_id = $1::uuid",
        [PROJECT_A_ID],
      ),
    ).rejects.toThrow(/permission denied|append-only/i);

    const idempotencyValues = [PROJECT_A_ID, "idempotency-a-1", "approve", "approve-a", "digest-a"];
    const insertIdempotency = () =>
      db.query(
        `INSERT INTO public.idempotency_records
          (project_id, id, version, state, command_type, idempotency_key,
           request_hash, retention_until, document)
         VALUES
          ($1::uuid, $2, 1, 'in_progress', $3, $4, $5,
           transaction_timestamp() + interval '1 day',
           jsonb_build_object('id', $2::text, 'projectId', $1::text,
                              'version', 1, 'state', 'in_progress'))`,
        idempotencyValues,
      );
    await insertIdempotency();
    await expect(insertIdempotency()).rejects.toThrow(/unique|duplicate/i);
  });

  test("ledger journal and entries must commit as one balanced append-only set", async () => {
    await asApplicationUser(USER_A_ID);
    await db.exec(`
      BEGIN;
      INSERT INTO public.budget_reservations
        (project_id, id, pay_run_id, scope_generation, version, status, document)
      VALUES
        ('${PROJECT_A_ID}'::uuid, 'reservation-a', 'payrun-a', 1, 1, 'active',
         jsonb_build_object('id', 'reservation-a', 'projectId', '${PROJECT_A_ID}',
                            'version', 1, 'status', 'active'));
      INSERT INTO public.funding_preparations
        (project_id, id, pay_run_id, budget_reservation_id, version, status, document)
      VALUES
        ('${PROJECT_A_ID}'::uuid, 'funding-a', 'payrun-a', 'reservation-a', 1,
         'sandbox_prepared',
         jsonb_build_object('id', 'funding-a', 'projectId', '${PROJECT_A_ID}',
                            'version', 1, 'status', 'sandbox_prepared'));
      INSERT INTO public.payment_executions
        (project_id, id, pay_run_id, funding_preparation_id, execution_key,
         version, status, document)
      VALUES
        ('${PROJECT_A_ID}'::uuid, 'payment-a', 'payrun-a', 'funding-a', 'execution-a',
         1, 'succeeded',
         jsonb_build_object('id', 'payment-a', 'projectId', '${PROJECT_A_ID}',
                            'version', 1, 'status', 'succeeded'));
      INSERT INTO public.ledger_journals
        (project_id, id, pay_run_id, payment_execution_id, execution_proof_id,
         external_reference, version, document)
      VALUES
        ('${PROJECT_A_ID}'::uuid, 'journal-a', 'payrun-a', 'payment-a', 'proof-a',
         'sandbox-reference-a', 1,
         jsonb_build_object('id', 'journal-a', 'projectId', '${PROJECT_A_ID}', 'version', 1));
      INSERT INTO public.ledger_entries
        (project_id, id, journal_id, account_id, account_role, debit_atomic,
         credit_atomic, evidence_hash)
      VALUES
        ('${PROJECT_A_ID}'::uuid, 'entry-a-debit', 'journal-a', 'source-a',
         'sandbox_funding_source', 420000, 0, 'evidence-a'),
        ('${PROJECT_A_ID}'::uuid, 'entry-a-credit', 'journal-a', 'merchant-a',
         'sandbox_merchant_payable', 0, 420000, 'evidence-a');
      COMMIT;
    `);

    const totals = await db.query<{ debits: string; credits: string }>(
      `SELECT sum(debit_atomic)::text AS debits, sum(credit_atomic)::text AS credits
       FROM public.ledger_entries
       WHERE project_id = $1::uuid AND journal_id = 'journal-a'`,
      [PROJECT_A_ID],
    );
    expect(totals.rows).toEqual([{ debits: "420000", credits: "420000" }]);

    await expect(
      db.exec(`
        BEGIN;
        INSERT INTO public.ledger_journals
          (project_id, id, pay_run_id, payment_execution_id, execution_proof_id,
           external_reference, version, document)
        VALUES
          ('${PROJECT_A_ID}'::uuid, 'journal-imbalanced', 'payrun-a', 'payment-a',
           'proof-imbalanced', 'sandbox-reference-imbalanced', 1,
           jsonb_build_object('id', 'journal-imbalanced', 'projectId', '${PROJECT_A_ID}',
                              'version', 1));
        INSERT INTO public.ledger_entries
          (project_id, id, journal_id, account_id, account_role, debit_atomic,
           credit_atomic, evidence_hash)
        VALUES
          ('${PROJECT_A_ID}'::uuid, 'entry-imbalanced', 'journal-imbalanced', 'source-a',
           'sandbox_funding_source', 1, 0, 'evidence-imbalanced');
        COMMIT;
      `),
    ).rejects.toThrow(/not balanced/i);
    await db.exec("ROLLBACK");
  });
});
