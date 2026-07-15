import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import {
  AppendOnlyViolationError,
  CommitOutcomeUnknownError,
  openPayRunPersistence,
  PersistenceUnavailableError,
  UnsafeDatabaseRoleError,
} from "@/features/payrun/adapters/storage";
import { createHostedSandboxControlLoop } from "@/features/payrun/adapters/sandbox";
import { openPostgresPayRunStorage } from "@/features/payrun/adapters/storage/postgres/postgres-storage";
import type {
  SqlClient,
  SqlPool,
  SqlQueryResult,
} from "@/features/payrun/adapters/storage/postgres/sql";
import {
  InvariantViolationError,
  ProjectScopeError,
  SchemaValidationError,
  VersionConflictError,
} from "@/features/payrun/domain/errors";
import type {
  AuditEvent,
  DomainOutboxEvent,
  IdempotencyRecord,
  LedgerJournal,
  PayRun,
} from "@/features/payrun/domain/types";
import {
  buildApproval,
  buildAuditEvent,
  buildBudgetReservation,
  buildFundingPreparation,
  buildIdempotencyRecord,
  buildLedgerJournal,
  buildOutboxEvent,
  buildPaymentExecution,
  buildPayRunAt,
  PAY_RUN_ID,
  UPDATED_AT,
} from "@/test/payrun/domain/fixtures";
import { buildInboxEventFixture } from "@/test/payrun/storage/fixtures";

const migrationPath = fileURLToPath(
  new URL("../../../../supabase/migrations/202607150001_hosted_project_and_payrun_storage.sql", import.meta.url),
);
const USER_A_ID = "00000000-0000-4000-8000-00000000000a";
const USER_B_ID = "00000000-0000-4000-8000-00000000000b";
const PROJECT_A_ID = "10000000-0000-4000-8000-00000000000a";
const PROJECT_B_ID = "10000000-0000-4000-8000-00000000000b";

class PGliteClient implements SqlClient {
  constructor(
    private readonly db: PGlite,
    private readonly sessionRole: RoleFact,
  ) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    if (text.includes("session_user AS role_name")) {
      return { rows: [this.sessionRole as unknown as Row], rowCount: 1 };
    }
    const result = await this.db.query<Row>(text, [...values]);
    return {
      rows: result.rows,
      rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
    };
  }

  release(): void {}
}

class PGlitePool implements SqlPool {
  constructor(
    private readonly db: PGlite,
    private readonly loginRole = "zenfix_login",
  ) {}

  async connect(): Promise<SqlClient> {
    await this.db.exec("RESET ROLE");
    await this.db.exec(`SET ROLE ${this.loginRole}`);
    return new PGliteClient(this.db, this.loginRole === "postgres"
      ? { role_name: "postgres", rolsuper: true, rolbypassrls: true }
      : { role_name: this.loginRole, rolsuper: false, rolbypassrls: false });
  }

  async end(): Promise<void> {}
}

interface RoleFact extends Record<string, unknown> {
  readonly role_name: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
}

class AuditedSqlClient implements SqlClient {
  readonly events: string[] = [];
  failOn:
    | "assume_role"
    | "auth_subject"
    | "auth_subject_codeless"
    | "commit"
    | "commit_codeless"
    | null = null;
  rollbackAttempts = 0;
  releases = 0;

  constructor(
    readonly sessionRole: RoleFact,
    readonly effectiveRole: RoleFact = {
      role_name: "zenfix_app",
      rolsuper: false,
      rolbypassrls: false,
    },
  ) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<SqlQueryResult<Row>> {
    const normalized = text.replace(/\s+/g, " ").trim();
    this.events.push(normalized);
    if (normalized === "ROLLBACK") this.rollbackAttempts += 1;
    if (this.failOn === "assume_role" && normalized === "SET LOCAL ROLE zenfix_app") {
      throw Object.assign(new Error("connection lost while assuming role"), { code: "08006" });
    }
    if (this.failOn === "auth_subject" && normalized.includes("set_config")) {
      throw Object.assign(new Error("connection lost before operation"), { code: "08006" });
    }
    if (this.failOn === "auth_subject_codeless" && normalized.includes("set_config")) {
      throw new Error("Connection terminated unexpectedly");
    }
    if (this.failOn === "commit" && normalized === "COMMIT") {
      throw Object.assign(new Error("commit response lost"), { code: "ECONNRESET" });
    }
    if (this.failOn === "commit_codeless" && normalized === "COMMIT") {
      throw new Error("Connection terminated unexpectedly");
    }
    if (normalized.includes("session_user AS role_name")) {
      return { rows: [this.sessionRole as unknown as Row], rowCount: 1 };
    }
    if (normalized.includes("current_user AS role_name")) {
      return { rows: [this.effectiveRole as unknown as Row], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id FROM public.projects")) {
      return { rows: [{ id: PROJECT_A_ID } as unknown as Row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  release(): void {
    this.releases += 1;
    this.events.push("RELEASE");
  }
}

class AuditedSqlPool implements SqlPool {
  constructor(readonly client: AuditedSqlClient) {}
  async connect(): Promise<SqlClient> {
    return this.client;
  }
  async end(): Promise<void> {}
}

class NonUnitCasRowCountClient extends AuditedSqlClient {
  constructor(private readonly current: PayRun) {
    super({ role_name: "zenfix_login", rolsuper: false, rolbypassrls: false });
  }

  override async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<SqlQueryResult<Row>> {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.includes("FROM public.pay_runs") && normalized.endsWith("FOR UPDATE")) {
      this.events.push(normalized);
      return {
        rows: [{
          version: this.current.version,
          state_value: this.current.status,
          created_at: this.current.createdAt,
          document: this.current,
        } as unknown as Row],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("UPDATE public.pay_runs")) {
      this.events.push(normalized);
      const updated = { ...this.current, version: this.current.version + 1, updatedAt: UPDATED_AT };
      return {
        rows: [
          { document: updated } as unknown as Row,
          { document: updated } as unknown as Row,
        ],
        rowCount: 2,
      };
    }
    return super.query<Row>(text);
  }
}

let db: PGlite;
let pool: PGlitePool;
const openStorages: Array<{ close(): Promise<void> }> = [];
const tempRoots: string[] = [];

function withProject<T>(value: T, projectId: string): T {
  return JSON.parse(
    JSON.stringify(value, (key, nested) => (key === "projectId" ? projectId : nested)),
  ) as T;
}

function withPayRunId<T>(value: T, payRunId: string): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) => (nested === PAY_RUN_ID ? payRunId : nested)),
  ) as T;
}

function initialPayRun(projectId = PROJECT_A_ID): PayRun {
  return withProject(
    {
      ...buildPayRunAt("intent_recorded"),
      version: 1,
      lastAuditSequence: 1,
      lastOutboxSequence: 1,
    },
    projectId,
  );
}

function creationAudit(projectId = PROJECT_A_ID): AuditEvent {
  return withProject(
    buildAuditEvent({
      id: "audit_001",
      sequence: 1,
      beforeVersion: 0,
      afterVersion: 1,
    }),
    projectId,
  );
}

function creationOutbox(projectId = PROJECT_A_ID): DomainOutboxEvent {
  return withProject(
    buildOutboxEvent({
      id: "outbox_001",
      sequence: 1,
      aggregateVersion: 1,
      eventType: "payrun.created",
      payload: { payRunId: PAY_RUN_ID, afterVersion: 1 },
    }),
    projectId,
  );
}

function rootIdempotency(projectId = PROJECT_A_ID): IdempotencyRecord {
  return withProject(
    buildIdempotencyRecord({
      id: "idempotency_001",
      commandType: "create_payrun",
      key: "create-payrun-001",
      resultVersion: 1,
    }),
    projectId,
  );
}

function ledgerJournal(projectId = PROJECT_A_ID): LedgerJournal {
  const journal = withProject(buildLedgerJournal(), projectId);
  return {
    ...journal,
    entries: journal.entries.map((entry) => ({
      ...entry,
      accountId: `sandbox:${projectId}:${entry.accountRole}`,
    })),
  };
}

async function openFor(userId = USER_A_ID, projectId = PROJECT_A_ID) {
  const storage = await openPostgresPayRunStorage({ pool, context: { userId, projectId } });
  openStorages.push(storage);
  return storage;
}

async function insertBaseline(storage: Awaited<ReturnType<typeof openFor>>): Promise<PayRun> {
  const payRun = initialPayRun();
  await storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
    await context.payRuns.insert(PROJECT_A_ID, payRun);
    await context.auditEvents.append(PROJECT_A_ID, creationAudit());
    await context.domainOutbox.append(PROJECT_A_ID, creationOutbox());
    await context.idempotency.insert(PROJECT_A_ID, rootIdempotency());
  });
  return payRun;
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    INSERT INTO auth.users (id) VALUES ('${USER_A_ID}'::uuid), ('${USER_B_ID}'::uuid);
  `);
  await db.exec(await readFile(migrationPath, "utf8"));
  await db.exec(`
    CREATE ROLE zenfix_login NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
    GRANT zenfix_app TO zenfix_login;
  `);
  pool = new PGlitePool(db);
}, 60_000);

beforeEach(async () => {
  await db.exec("RESET ROLE");
  await db.exec("TRUNCATE public.projects CASCADE");
  await db.exec(`
    INSERT INTO public.projects (id, owner_user_id, name) VALUES
      ('${PROJECT_A_ID}'::uuid, '${USER_A_ID}'::uuid, 'Workspace A'),
      ('${PROJECT_B_ID}'::uuid, '${USER_B_ID}'::uuid, 'Workspace B');
  `);
});

afterEach(async () => {
  await Promise.allSettled(openStorages.splice(0).map((storage) => storage.close()));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

afterAll(async () => {
  await db.close();
});

describe.sequential("storage profile factory", () => {
  test.each(["local", "test", "offline"] as const)(
    "%s profile selects the existing Local JSON persistence",
    async (profile) => {
      const root = await mkdtemp(join(tmpdir(), "zenfix-persistence-profile-"));
      tempRoots.push(root);
      const persistence = await openPayRunPersistence({
        profile,
        storePath: join(root, "payrun-store.json"),
      });
      openStorages.push(persistence);

      expect(persistence.backend).toBe("local_json");
    },
  );

  test("hosted profile without database configuration fails closed", async () => {
    await expect(
      openPayRunPersistence({
        profile: "hosted_sandbox",
        databaseUrl: undefined,
        context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
      }),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  test("an unavailable Hosted database fails closed without selecting Local JSON", async () => {
    let poolClosed = false;
    const unavailablePool: SqlPool = {
      connect: async () => {
        throw new Error("connection refused");
      },
      end: async () => {
        poolClosed = true;
      },
    };

    await expect(
      openPostgresPayRunStorage({
        pool: unavailablePool,
        context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
      }),
    ).rejects.toMatchObject({ code: "persistence_unavailable" });
    expect(poolClosed).toBe(true);
  });

  test("preserves project authorization errors instead of classifying them as unavailable", async () => {
    await expect(
      openPayRunPersistence(
        {
          profile: "hosted_sandbox",
          databaseUrl: "postgresql://test.invalid/postgres",
          context: { userId: USER_B_ID, projectId: PROJECT_A_ID },
        },
        { createPostgresPool: async () => pool },
      ),
    ).rejects.toBeInstanceOf(ProjectScopeError);
  });
});

describe.sequential("Postgres PayRun persistence", () => {
  test("runs the canonical Sandbox Control Loop against an owned UUID Hosted project", async () => {
    const storage = await openFor();
    const service = createHostedSandboxControlLoop(storage, { projectId: PROJECT_A_ID });

    const result = await service.execute({
      projectId: PROJECT_A_ID,
      scenarioId: "allowed",
      idempotencyKey: "hosted:allowed:001",
      correlationId: "hosted:correlation:001",
      requester: { actorId: "hosted_agent_owner", actorType: "agent" },
    });

    expect(result.payRun.status).toBe("completed");
    await expect(storage.payRuns.get(PROJECT_A_ID, result.payRun.id)).resolves.toEqual(result.payRun);
    await expect(storage.auditEvents.list(PROJECT_A_ID, result.payRun.id)).resolves.toHaveLength(11);
    await expect(
      storage.domainOutbox.get(PROJECT_A_ID, `outbox_${result.payRun.id}_11`),
    ).resolves.toMatchObject({ aggregateVersion: 11, sequence: 11 });
    await expect(
      storage.idempotency.get(PROJECT_A_ID, "create_payrun", "hosted:allowed:001"),
    ).resolves.toMatchObject({ resultResourceId: result.payRun.id });
  });

  test("rejects unsafe login roles before tenant queries", async () => {
    await expect(
      openPostgresPayRunStorage({
        pool: new PGlitePool(db, "postgres"),
        context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
      }),
    ).rejects.toBeInstanceOf(UnsafeDatabaseRoleError);
  });

  test("rejects an unsafe session_user even when current_user appears safe", async () => {
    const client = new AuditedSqlClient({
      role_name: "postgres",
      rolsuper: true,
      rolbypassrls: true,
    });

    await expect(
      openPostgresPayRunStorage({
        pool: new AuditedSqlPool(client),
        context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
      }),
    ).rejects.toMatchObject({ code: "unsafe_database_role", role: "postgres" });
    expect(client.events.some((event) => event.includes("session_user AS role_name"))).toBe(true);
    expect(client.events.some((event) => event.startsWith("SET LOCAL ROLE"))).toBe(false);
  });

  test.each([
    { role_name: "bypass_login", rolsuper: false, rolbypassrls: true },
    { role_name: "service_role", rolsuper: false, rolbypassrls: false },
  ] as const)("rejects unsafe session role $role_name", async (sessionRole) => {
    const client = new AuditedSqlClient(sessionRole);
    await expect(
      openPostgresPayRunStorage({
        pool: new AuditedSqlPool(client),
        context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
      }),
    ).rejects.toMatchObject({ code: "unsafe_database_role", role: sessionRole.role_name });
  });

  test("uses one client with ordered session/effective role checks and transaction context", async () => {
    const client = new AuditedSqlClient({
      role_name: "zenfix_login",
      rolsuper: false,
      rolbypassrls: false,
    });
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    client.events.length = 0;

    await storage.unitOfWork.execute(PROJECT_A_ID, async () => {
      client.events.push("OPERATION");
    });

    expect(client.events).toEqual([
      "BEGIN",
      expect.stringContaining("session_user AS role_name"),
      "SET LOCAL ROLE zenfix_app",
      expect.stringContaining("current_user AS role_name"),
      expect.stringContaining("set_config('request.jwt.claim.sub'"),
      expect.stringContaining("SELECT id FROM public.projects"),
      "OPERATION",
      "COMMIT",
      "RELEASE",
    ]);
  });

  test("maps a pre-commit connection loss to unavailable and attempts rollback and release", async () => {
    const client = new AuditedSqlClient({
      role_name: "zenfix_login",
      rolsuper: false,
      rolbypassrls: false,
    });
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    const rollbackBefore = client.rollbackAttempts;
    const releasesBefore = client.releases;
    client.failOn = "auth_subject";

    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async () => undefined),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(client.rollbackAttempts).toBe(rollbackBefore + 1);
    expect(client.releases).toBe(releasesBefore + 1);
  });

  test("does not misclassify a connection loss during role assumption as a security denial", async () => {
    const client = new AuditedSqlClient({
      role_name: "zenfix_login",
      rolsuper: false,
      rolbypassrls: false,
    });
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    client.failOn = "assume_role";

    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async () => undefined),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  test("maps node-postgres code-less pre-commit termination to unavailable", async () => {
    const client = new AuditedSqlClient({
      role_name: "zenfix_login",
      rolsuper: false,
      rolbypassrls: false,
    });
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    client.failOn = "auth_subject_codeless";

    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async () => undefined),
    ).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  test("reports a lost COMMIT response as an unknown outcome and still releases the client", async () => {
    const client = new AuditedSqlClient({
      role_name: "zenfix_login",
      rolsuper: false,
      rolbypassrls: false,
    });
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    const rollbackBefore = client.rollbackAttempts;
    const releasesBefore = client.releases;
    client.failOn = "commit";

    const error = await storage.unitOfWork.execute(
      PROJECT_A_ID,
      async () => undefined,
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CommitOutcomeUnknownError);
    expect(error).toMatchObject({
      name: "CommitOutcomeUnknownError",
      code: "postgres_commit_outcome_unknown",
      outcome: "unknown",
      reconciliationRequired: true,
    });
    expect(client.rollbackAttempts).toBe(rollbackBefore + 1);
    expect(client.releases).toBe(releasesBefore + 1);
  });

  test("maps node-postgres code-less COMMIT termination to an unknown outcome", async () => {
    const client = new AuditedSqlClient({
      role_name: "zenfix_login",
      rolsuper: false,
      rolbypassrls: false,
    });
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    client.failOn = "commit_codeless";

    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async () => undefined),
    ).rejects.toBeInstanceOf(CommitOutcomeUnknownError);
  });

  test("owner transaction round-trips a runtime-validated canonical PayRun", async () => {
    const storage = await openFor();
    const expected = await insertBaseline(storage);

    await expect(storage.payRuns.get(PROJECT_A_ID, PAY_RUN_ID)).resolves.toEqual(expected);
    await expect(storage.auditEvents.list(PROJECT_A_ID, PAY_RUN_ID)).resolves.toEqual([
      creationAudit(),
    ]);
    await expect(storage.domainOutbox.get(PROJECT_A_ID, "outbox_001")).resolves.toEqual(
      creationOutbox(),
    );
  });

  test("trusted context and RLS both deny cross-project access", async () => {
    const owner = await openFor();
    await insertBaseline(owner);
    const other = await openFor(USER_B_ID, PROJECT_B_ID);

    await expect(other.payRuns.get(PROJECT_B_ID, PAY_RUN_ID)).resolves.toBeNull();
    await expect(other.payRuns.get(PROJECT_A_ID, PAY_RUN_ID)).rejects.toBeInstanceOf(
      ProjectScopeError,
    );
  });

  test("stale CAS returns the canonical typed conflict", async () => {
    const storage = await openFor();
    const current = await insertBaseline(storage);
    const next = { ...current, version: 2, updatedAt: UPDATED_AT };

    await storage.payRuns.compareAndSet(PROJECT_A_ID, current.id, 1, current.status, next);
    await expect(
      storage.payRuns.compareAndSet(PROJECT_A_ID, current.id, 1, current.status, next),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  test("CAS rejects a changed aggregate creation identity", async () => {
    const storage = await openFor();
    const current = await insertBaseline(storage);
    const changedCreation = {
      ...current,
      version: 2,
      createdAt: "2026-07-13T09:59:59.000Z",
      updatedAt: UPDATED_AT,
    };

    await expect(
      storage.payRuns.compareAndSet(
        PROJECT_A_ID,
        current.id,
        current.version,
        current.status,
        changedCreation,
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  test("CAS of a missing aggregate returns the canonical typed conflict", async () => {
    const storage = await openFor();
    const next = {
      ...withPayRunId(initialPayRun(), "missing_payrun"),
      version: 2,
      updatedAt: UPDATED_AT,
    };

    await expect(
      storage.payRuns.compareAndSet(PROJECT_A_ID, next.id, 1, next.status, next),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  test("CAS rejects any affected row count other than exactly one", async () => {
    const current = initialPayRun();
    const client = new NonUnitCasRowCountClient(current);
    const storage = await openPostgresPayRunStorage({
      pool: new AuditedSqlPool(client),
      context: { userId: USER_A_ID, projectId: PROJECT_A_ID },
    });
    const next = { ...current, version: 2, updatedAt: UPDATED_AT };

    await expect(
      storage.payRuns.compareAndSet(PROJECT_A_ID, current.id, 1, current.status, next),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  test("PayRun CAS, Audit, Outbox, and Idempotency commit atomically", async () => {
    const storage = await openFor();
    const current = await insertBaseline(storage);
    const next: PayRun = {
      ...current,
      version: 2,
      lastAuditSequence: 2,
      lastOutboxSequence: 2,
      updatedAt: UPDATED_AT,
    };
    const audit = withProject(
      buildAuditEvent({ id: "audit_002", sequence: 2, beforeVersion: 1, afterVersion: 2 }),
      PROJECT_A_ID,
    );
    const outbox = withProject(
      buildOutboxEvent({ id: "outbox_002", sequence: 2, aggregateVersion: 2 }),
      PROJECT_A_ID,
    );
    const idempotency = withProject(
      buildIdempotencyRecord({ id: "idempotency_002", key: "transition-002", resultVersion: 2 }),
      PROJECT_A_ID,
    );

    await storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
      await context.payRuns.compareAndSet(PROJECT_A_ID, current.id, 1, current.status, next);
      await context.auditEvents.append(PROJECT_A_ID, audit);
      await context.domainOutbox.append(PROJECT_A_ID, outbox);
      await context.idempotency.insert(PROJECT_A_ID, idempotency);
    });

    await expect(storage.payRuns.get(PROJECT_A_ID, current.id)).resolves.toEqual(next);
    await expect(storage.auditEvents.list(PROJECT_A_ID, current.id)).resolves.toEqual([
      creationAudit(),
      audit,
    ]);
    await expect(storage.domainOutbox.get(PROJECT_A_ID, outbox.id)).resolves.toEqual(outbox);
  });

  test("an operation failure rolls back every partial repository write", async () => {
    const storage = await openFor();
    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
        await context.payRuns.insert(PROJECT_A_ID, initialPayRun());
        await context.auditEvents.append(PROJECT_A_ID, creationAudit());
        await context.domainOutbox.append(PROJECT_A_ID, creationOutbox());
        throw new Error("injected failure");
      }),
    ).rejects.toThrow("injected failure");

    await expect(storage.payRuns.get(PROJECT_A_ID, PAY_RUN_ID)).resolves.toBeNull();
    await expect(storage.auditEvents.list(PROJECT_A_ID, PAY_RUN_ID)).resolves.toEqual([]);
    await expect(storage.domainOutbox.get(PROJECT_A_ID, "outbox_001")).resolves.toBeNull();
  });

  test("duplicate idempotency rolls back an otherwise valid mutation", async () => {
    const storage = await openFor();
    const current = await insertBaseline(storage);
    const next = { ...current, version: 2, updatedAt: UPDATED_AT };

    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
        await context.payRuns.compareAndSet(PROJECT_A_ID, current.id, 1, current.status, next);
        await context.idempotency.insert(PROJECT_A_ID, rootIdempotency());
      }),
    ).rejects.toMatchObject({ code: "duplicate_storage_record" });

    await expect(storage.payRuns.get(PROJECT_A_ID, current.id)).resolves.toEqual(current);
  });

  test("duplicate Audit, Outbox, and Ledger appends use append-only typed errors", async () => {
    const storage = await openFor();
    await insertBaseline(storage);

    await expect(storage.auditEvents.append(PROJECT_A_ID, creationAudit())).rejects.toBeInstanceOf(
      AppendOnlyViolationError,
    );
    await expect(storage.domainOutbox.append(PROJECT_A_ID, creationOutbox())).rejects.toBeInstanceOf(
      AppendOnlyViolationError,
    );

    const approval = withProject(buildApproval("pending"), PROJECT_A_ID);
    const reservation = withProject(buildBudgetReservation(), PROJECT_A_ID);
    const funding = withProject(buildFundingPreparation("not_required"), PROJECT_A_ID);
    const payment = withProject(buildPaymentExecution("succeeded"), PROJECT_A_ID);
    const journal = ledgerJournal();
    await storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
      await context.approvals.insert(PROJECT_A_ID, approval);
      await context.budgetReservations.insert(PROJECT_A_ID, reservation);
      await context.fundingPreparations.insert(PROJECT_A_ID, funding);
      await context.paymentExecutions.insert(PROJECT_A_ID, payment);
      await context.ledger.append(PROJECT_A_ID, journal);
    });
    await expect(storage.ledger.append(PROJECT_A_ID, journal)).rejects.toBeInstanceOf(
      AppendOnlyViolationError,
    );
  });

  test("all stage repositories and a balanced Ledger commit in one transaction", async () => {
    const storage = await openFor();
    await insertBaseline(storage);
    const approval = withProject(buildApproval("pending"), PROJECT_A_ID);
    const reservation = withProject(buildBudgetReservation(), PROJECT_A_ID);
    const funding = withProject(buildFundingPreparation("not_required"), PROJECT_A_ID);
    const payment = withProject(buildPaymentExecution("succeeded"), PROJECT_A_ID);
    const journal = ledgerJournal();
    const inbox = withProject(buildInboxEventFixture(), PROJECT_A_ID);

    await storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
      await context.approvals.insert(PROJECT_A_ID, approval);
      await context.budgetReservations.insert(PROJECT_A_ID, reservation);
      await context.fundingPreparations.insert(PROJECT_A_ID, funding);
      await context.paymentExecutions.insert(PROJECT_A_ID, payment);
      await context.ledger.append(PROJECT_A_ID, journal);
      await context.inbox!.insert(PROJECT_A_ID, inbox);
    });

    await expect(storage.approvals.get(PROJECT_A_ID, approval.id)).resolves.toEqual(approval);
    await expect(storage.budgetReservations.get(PROJECT_A_ID, reservation.id)).resolves.toEqual(
      reservation,
    );
    await expect(storage.fundingPreparations.get(PROJECT_A_ID, funding.id)).resolves.toEqual(funding);
    await expect(storage.paymentExecutions.get(PROJECT_A_ID, payment.id)).resolves.toEqual(payment);
    await expect(storage.ledger.get(PROJECT_A_ID, journal.id)).resolves.toEqual(journal);
    await expect(storage.inbox.get(PROJECT_A_ID, inbox.source, inbox.sourceEventId)).resolves.toEqual(
      inbox,
    );
  });

  test("imbalanced Ledger input aborts its surrounding transaction", async () => {
    const storage = await openFor();
    await insertBaseline(storage);
    const reservation = withProject(buildBudgetReservation(), PROJECT_A_ID);
    const funding = withProject(buildFundingPreparation("not_required"), PROJECT_A_ID);
    const payment = withProject(buildPaymentExecution("succeeded"), PROJECT_A_ID);
    const validJournal = ledgerJournal();
    const imbalanced: LedgerJournal = {
      ...validJournal,
      entries: validJournal.entries.map((entry, index) =>
        index === 1 ? { ...entry, creditAtomic: "410000" } : entry,
      ),
    };

    await expect(
      storage.unitOfWork.execute(PROJECT_A_ID, async (context) => {
        await context.budgetReservations.insert(PROJECT_A_ID, reservation);
        await context.fundingPreparations.insert(PROJECT_A_ID, funding);
        await context.paymentExecutions.insert(PROJECT_A_ID, payment);
        await context.ledger.append(PROJECT_A_ID, imbalanced);
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(storage.budgetReservations.get(PROJECT_A_ID, reservation.id)).resolves.toBeNull();
    await expect(storage.ledger.get(PROJECT_A_ID, validJournal.id)).resolves.toBeNull();
  });

  test("database document tampering is rejected by the canonical runtime schema", async () => {
    const storage = await openFor();
    await insertBaseline(storage);
    await db.exec("RESET ROLE");
    await db.query(
      `UPDATE public.pay_runs
       SET version = 2,
           document = jsonb_build_object(
             'id', id, 'projectId', project_id::text, 'version', 2, 'status', status
           ),
           updated_at = transaction_timestamp()
       WHERE project_id = $1::uuid AND id = $2`,
      [PROJECT_A_ID, PAY_RUN_ID],
    );

    await expect(storage.payRuns.get(PROJECT_A_ID, PAY_RUN_ID)).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
  });

  test("CAS rejects and preserves a tampered current document instead of repairing it", async () => {
    const storage = await openFor();
    const original = await insertBaseline(storage);
    await db.exec("RESET ROLE");
    await db.query(
      `UPDATE public.pay_runs
       SET version = 2,
           document = jsonb_build_object(
             'id', id, 'projectId', project_id::text, 'version', 2, 'status', status
           ),
           updated_at = $3
       WHERE project_id = $1::uuid AND id = $2`,
      [PROJECT_A_ID, PAY_RUN_ID, UPDATED_AT],
    );
    const before = (await db.query<{ document: unknown }>(
      "SELECT document FROM public.pay_runs WHERE project_id = $1::uuid AND id = $2",
      [PROJECT_A_ID, PAY_RUN_ID],
    )).rows[0]?.document;
    const next = {
      ...original,
      version: 3,
      updatedAt: "2026-07-12T00:02:00.000Z",
    };

    await expect(
      storage.payRuns.compareAndSet(PROJECT_A_ID, PAY_RUN_ID, 2, original.status, next),
    ).rejects.toBeInstanceOf(SchemaValidationError);

    await db.exec("RESET ROLE");
    const after = (await db.query<{ document: unknown }>(
      "SELECT document FROM public.pay_runs WHERE project_id = $1::uuid AND id = $2",
      [PROJECT_A_ID, PAY_RUN_ID],
    )).rows[0]?.document;
    expect(after).toEqual(before);
  });
});
