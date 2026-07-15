import type {
  ApprovalRepository,
  AuditEventRepository,
  BudgetReservationRepository,
  DomainOutboxRepository,
  FundingPreparationRepository,
  IdempotencyRepository,
  InboxEventRepository,
  LedgerRepository,
  PayRunListQuery,
  PayRunPersistence,
  PayRunRepository,
  PayRunUnitOfWorkContext,
  PaymentExecutionRepository,
} from "../../../application/ports";
import {
  AuditAppendError,
  InvariantViolationError,
  ProjectScopeError,
  SchemaValidationError,
  VersionConflictError,
} from "../../../domain/errors";
import { appendAuditEvent, appendDomainOutboxEvent } from "../../../domain/invariants";
import {
  approvalSchema,
  auditEventSchema,
  budgetReservationSchema,
  domainOutboxEventSchema,
  fundingPreparationSchema,
  idempotencyRecordSchema,
  inboxEventSchema,
  ledgerJournalSchema,
  paymentExecutionSchema,
  payRunSchema,
  type RuntimeSchema,
} from "../../../domain/schemas";
import type {
  AggregateRoot,
  Approval,
  AuditEvent,
  BudgetReservation,
  CompareAndSetResult,
  DomainOutboxEvent,
  FundingPreparation,
  IdempotencyRecord,
  InboxEvent,
  LedgerJournal,
  PaymentExecution,
  PayRun,
} from "../../../domain/types";
import {
  AdapterClosedError,
  AppendOnlyViolationError,
  CommitOutcomeUnknownError,
  DuplicateRecordError,
  PersistenceUnavailableError,
  UnsafeDatabaseRoleError,
} from "../errors";
import type { SqlClient, SqlPool, TrustedProjectContext } from "./sql";

interface PostgresStorageOptions {
  readonly pool: SqlPool;
  readonly context: TrustedProjectContext;
}

interface DocumentRow extends Record<string, unknown> {
  readonly document: unknown;
}

interface VersionRow extends Record<string, unknown> {
  readonly version: number;
}

interface AggregateCasRow extends VersionRow {
  readonly state_value: string;
  readonly created_at: Date | string;
  readonly document: unknown;
}

interface RoleRow extends Record<string, unknown> {
  readonly role_name: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
}

interface AuditRow extends Record<string, unknown> {
  readonly id: string;
  readonly project_id: string;
  readonly pay_run_id: string;
  readonly aggregate_type: "PayRun";
  readonly aggregate_id: string;
  readonly sequence: number;
  readonly before_version: number;
  readonly after_version: number;
  readonly actor_id: string;
  readonly actor_type: AuditEvent["actor"]["actorType"];
  readonly action_code: string;
  readonly reason_code: string;
  readonly idempotency_key: string;
  readonly correlation_id: string;
  readonly occurred_at: Date | string;
  readonly details: unknown;
}

interface OutboxRow extends Record<string, unknown> {
  readonly id: string;
  readonly project_id: string;
  readonly aggregate_type: "PayRun";
  readonly aggregate_id: string;
  readonly aggregate_version: number;
  readonly sequence: number;
  readonly event_type: DomainOutboxEvent["eventType"];
  readonly schema_version: number;
  readonly payload: unknown;
  readonly occurred_at: Date | string;
}

type TransactionExecutor = <T>(operation: (client: SqlClient) => Promise<T>) => Promise<T>;

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function sqlErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isConnectionFailure(error: unknown): boolean {
  const code = sqlErrorCode(error);
  if (code !== undefined && (
    code.startsWith("08") ||
    ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03"].includes(code)
  )) {
    return true;
  }
  return error instanceof Error && [
    "Connection terminated",
    "Connection terminated unexpectedly",
  ].includes(error.message);
}

function mapSqlError(error: unknown, collection?: string, appendOnly = false): never {
  if (sqlErrorCode(error) === "23505") {
    if (appendOnly) {
      throw new AppendOnlyViolationError(collection ?? "postgres");
    }
    throw new DuplicateRecordError(collection ?? "postgres");
  }
  throw error;
}

function assertProject(expectedProjectId: string, actualProjectId: string): void {
  if (expectedProjectId !== actualProjectId) {
    throw new ProjectScopeError(expectedProjectId, actualProjectId);
  }
}

function parseDocument<T>(row: DocumentRow | undefined, schema: RuntimeSchema<T>): T | null {
  return row === undefined ? null : schema.parse(row.document);
}

function auditFromRow(row: AuditRow): AuditEvent {
  return auditEventSchema.parse({
    id: row.id,
    projectId: row.project_id,
    payRunId: row.pay_run_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    sequence: row.sequence,
    beforeVersion: row.before_version,
    afterVersion: row.after_version,
    actor: { actorId: row.actor_id, actorType: row.actor_type },
    actionCode: row.action_code,
    reasonCode: row.reason_code,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    occurredAt: timestamp(row.occurred_at),
    details: row.details,
  });
}

function outboxFromRow(row: OutboxRow): DomainOutboxEvent {
  return domainOutboxEventSchema.parse({
    id: row.id,
    projectId: row.project_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    sequence: row.sequence,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    payload: row.payload,
    occurredAt: timestamp(row.occurred_at),
  });
}

function createRepositorySet(execute: TransactionExecutor, boundProjectId: string): PayRunUnitOfWorkContext & {
  readonly inbox: InboxEventRepository;
} {
  const scoped = (projectId: string) => assertProject(boundProjectId, projectId);

  async function getDocument<T>(
    table: string,
    projectId: string,
    id: string,
    schema: RuntimeSchema<T>,
  ): Promise<T | null> {
    scoped(projectId);
    return execute(async (client) => {
      const result = await client.query<DocumentRow>(
        `SELECT document FROM public.${table} WHERE project_id = $1::uuid AND id = $2`,
        [projectId, id],
      );
      return parseDocument(result.rows[0], schema);
    });
  }

  async function insertAggregate<T extends AggregateRoot>(input: {
    readonly table: string;
    readonly collection: string;
    readonly projectId: string;
    readonly record: T;
    readonly schema: RuntimeSchema<T>;
    readonly statusColumn: "status" | "state";
    readonly status: string;
    readonly extraColumns?: readonly string[];
    readonly extraValues?: readonly unknown[];
  }): Promise<void> {
    scoped(input.projectId);
    assertProject(input.projectId, input.record.projectId);
    const parsed = input.schema.parse(input.record);
    const extraColumns = input.extraColumns ?? [];
    const extraValues = input.extraValues ?? [];
    const columns = [
      "project_id", "id", "version", input.statusColumn, "document", "created_at", "updated_at",
      ...extraColumns,
    ];
    const values: unknown[] = [
      input.projectId,
      parsed.id,
      parsed.version,
      input.status,
      JSON.stringify(parsed),
      parsed.createdAt,
      parsed.updatedAt,
      ...extraValues,
    ];
    const placeholders = values.map((_, index) => `$${index + 1}`);
    placeholders[0] = "$1::uuid";
    placeholders[4] = "$5::jsonb";
    try {
      await execute((client) =>
        client.query(
          `INSERT INTO public.${input.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
          values,
        ).then(() => undefined),
      );
    } catch (error) {
      mapSqlError(error, input.collection);
    }
  }

  async function compareAggregate<T extends AggregateRoot>(input: {
    readonly table: string;
    readonly projectId: string;
    readonly id: string;
    readonly expectedVersion: number;
    readonly expectedState: string;
    readonly stateColumn: "status" | "state";
    readonly nextState: string;
    readonly next: T;
    readonly schema: RuntimeSchema<T>;
  }): Promise<CompareAndSetResult<T>> {
    scoped(input.projectId);
    assertProject(input.projectId, input.next.projectId);
    if (input.next.id !== input.id || input.next.version !== input.expectedVersion + 1) {
      throw new VersionConflictError(input.expectedVersion + 1, input.next.version, input.id);
    }
    return execute(async (client) => {
      const locked = await client.query<AggregateCasRow>(
        `SELECT version, ${input.stateColumn} AS state_value, created_at, document
         FROM public.${input.table}
         WHERE project_id = $1::uuid AND id = $2
         FOR UPDATE`,
        [input.projectId, input.id],
      );
      const current = locked.rows[0];
      if (
        locked.rowCount !== 1 ||
        current === undefined ||
        current.version !== input.expectedVersion ||
        current.state_value !== input.expectedState
      ) {
        throw new VersionConflictError(
          input.expectedVersion,
          current?.version ?? 0,
          input.id,
        );
      }
      const parsedCurrent = input.schema.parse(current.document);
      const parsedCurrentState = (parsedCurrent as unknown as Record<string, unknown>)[
        input.stateColumn
      ];
      if (
        parsedCurrent.id !== input.id ||
        parsedCurrent.projectId !== input.projectId ||
        parsedCurrent.version !== current.version ||
        parsedCurrent.version !== input.expectedVersion ||
        parsedCurrentState !== current.state_value ||
        parsedCurrentState !== input.expectedState ||
        parsedCurrent.createdAt !== timestamp(current.created_at)
      ) {
        throw new SchemaValidationError(
          "Stored aggregate document does not match its relational CAS identity",
          { aggregateId: input.id },
        );
      }
      if (input.next.createdAt !== parsedCurrent.createdAt) {
        throw new InvariantViolationError("CAS cannot change aggregate creation identity", {
          aggregateId: input.id,
        });
      }
      const parsed = input.schema.parse(input.next);
      const result = await client.query<DocumentRow>(
        `UPDATE public.${input.table}
         SET version = $1, ${input.stateColumn} = $2, document = $3::jsonb, updated_at = $4
         WHERE project_id = $5::uuid AND id = $6
           AND version = $7 AND ${input.stateColumn} = $8
         RETURNING document`,
        [
          parsed.version,
          input.nextState,
          JSON.stringify(parsed),
          parsed.updatedAt,
          input.projectId,
          input.id,
          input.expectedVersion,
          input.expectedState,
        ],
      );
      if (result.rowCount !== 1) {
        throw new VersionConflictError(input.expectedVersion, current.version, input.id);
      }
      const updated = parseDocument(result.rows[0], input.schema);
      if (updated === null) {
        throw new VersionConflictError(input.expectedVersion, current.version, input.id);
      }
      return { kind: "updated", value: updated };
    });
  }

  const payRuns: PayRunRepository = {
    get: (projectId, id) => getDocument("pay_runs", projectId, id, payRunSchema),
    async list(projectId, query: PayRunListQuery = {}) {
      scoped(projectId);
      return execute(async (client) => {
        const result = await client.query<DocumentRow>(
          `SELECT document FROM public.pay_runs
           WHERE project_id = $1::uuid
           ORDER BY created_at, id`,
          [projectId],
        );
        let records = result.rows.map((row) => payRunSchema.parse(row.document));
        if (query.statuses) records = records.filter((record) => query.statuses!.includes(record.status));
        if (query.cursor) {
          const cursor = records.findIndex((record) => record.id === query.cursor);
          records = cursor < 0 ? [] : records.slice(cursor + 1);
        }
        return query.limit === undefined ? records : records.slice(0, query.limit);
      });
    },
    insert: (projectId, record) => insertAggregate({
      table: "pay_runs", collection: "payRuns", projectId, record, schema: payRunSchema,
      statusColumn: "status", status: record.status,
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) => compareAggregate({
      table: "pay_runs", projectId, id, expectedVersion, expectedState: expectedStatus,
      stateColumn: "status", nextState: next.status, next, schema: payRunSchema,
    }),
  };

  const approvals: ApprovalRepository = {
    get: (projectId, id) => getDocument("approvals", projectId, id, approvalSchema),
    insert: (projectId, record) => insertAggregate({
      table: "approvals", collection: "approvals", projectId, record, schema: approvalSchema,
      statusColumn: "status", status: record.status,
      extraColumns: ["pay_run_id"], extraValues: [record.payRunId],
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) => compareAggregate({
      table: "approvals", projectId, id, expectedVersion, expectedState: expectedStatus,
      stateColumn: "status", nextState: next.status, next, schema: approvalSchema,
    }),
  };

  const budgetReservations: BudgetReservationRepository = {
    get: (projectId, id) => getDocument("budget_reservations", projectId, id, budgetReservationSchema),
    async listActive(projectId, budgetKeys) {
      scoped(projectId);
      const requested = new Set(budgetKeys);
      return execute(async (client) => {
        const result = await client.query<DocumentRow>(
          "SELECT document FROM public.budget_reservations WHERE project_id = $1::uuid AND status = 'active'",
          [projectId],
        );
        return result.rows
          .map((row) => budgetReservationSchema.parse(row.document))
          .filter((record) => record.budgetKeys.some((key) => requested.has(key)));
      });
    },
    insert: (projectId, record) => insertAggregate({
      table: "budget_reservations", collection: "budgetReservations", projectId, record,
      schema: budgetReservationSchema, statusColumn: "status", status: record.status,
      extraColumns: ["pay_run_id", "scope_generation"],
      extraValues: [record.payRunId, record.scopeGeneration],
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) => compareAggregate({
      table: "budget_reservations", projectId, id, expectedVersion, expectedState: expectedStatus,
      stateColumn: "status", nextState: next.status, next, schema: budgetReservationSchema,
    }),
  };

  const fundingPreparations: FundingPreparationRepository = {
    get: (projectId, id) => getDocument("funding_preparations", projectId, id, fundingPreparationSchema),
    insert: (projectId, record) => insertAggregate({
      table: "funding_preparations", collection: "fundingPreparations", projectId, record,
      schema: fundingPreparationSchema, statusColumn: "status", status: record.status,
      extraColumns: ["pay_run_id", "budget_reservation_id"],
      extraValues: [record.payRunId, record.budgetReservationId],
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) => compareAggregate({
      table: "funding_preparations", projectId, id, expectedVersion, expectedState: expectedStatus,
      stateColumn: "status", nextState: next.status, next, schema: fundingPreparationSchema,
    }),
  };

  const paymentExecutions: PaymentExecutionRepository = {
    get: (projectId, id) => getDocument("payment_executions", projectId, id, paymentExecutionSchema),
    insert: (projectId, record) => insertAggregate({
      table: "payment_executions", collection: "paymentExecutions", projectId, record,
      schema: paymentExecutionSchema, statusColumn: "status", status: record.status,
      extraColumns: ["pay_run_id", "funding_preparation_id", "execution_key"],
      extraValues: [record.payRunId, record.instruction.fundingPreparationId, record.instruction.executionKey],
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) => compareAggregate({
      table: "payment_executions", projectId, id, expectedVersion, expectedState: expectedStatus,
      stateColumn: "status", nextState: next.status, next, schema: paymentExecutionSchema,
    }),
  };

  const ledger: LedgerRepository = {
    get: (projectId, id) => getDocument("ledger_journals", projectId, id, ledgerJournalSchema),
    async findByProof(projectId, proofId) {
      scoped(projectId);
      return execute(async (client) => parseDocument(
        (await client.query<DocumentRow>(
          "SELECT document FROM public.ledger_journals WHERE project_id = $1::uuid AND execution_proof_id = $2",
          [projectId, proofId],
        )).rows[0],
        ledgerJournalSchema,
      ));
    },
    async findByExternalReference(projectId, reference) {
      scoped(projectId);
      return execute(async (client) => parseDocument(
        (await client.query<DocumentRow>(
          "SELECT document FROM public.ledger_journals WHERE project_id = $1::uuid AND external_reference = $2",
          [projectId, reference],
        )).rows[0],
        ledgerJournalSchema,
      ));
    },
    async append(projectId, record) {
      scoped(projectId);
      assertProject(projectId, record.projectId);
      const parsed = ledgerJournalSchema.parse(record);
      try {
        await execute(async (client) => {
          await client.query(
            `INSERT INTO public.ledger_journals
              (project_id, id, pay_run_id, payment_execution_id, execution_proof_id,
               external_reference, version, document, committed_at, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
            [projectId, parsed.id, parsed.payRunId, parsed.paymentExecutionId,
              parsed.executionProofId, parsed.externalReference, parsed.version,
              JSON.stringify(parsed), parsed.committedAt, parsed.createdAt, parsed.updatedAt],
          );
          for (const entry of parsed.entries) {
            assertProject(projectId, entry.projectId);
            await client.query(
              `INSERT INTO public.ledger_entries
                (project_id, id, journal_id, account_id, account_role, debit_atomic,
                 credit_atomic, evidence_hash)
               VALUES ($1::uuid, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)`,
              [projectId, entry.id, parsed.id, entry.accountId, entry.accountRole,
                entry.debitAtomic, entry.creditAtomic, entry.evidenceHash],
            );
          }
        });
      } catch (error) {
        mapSqlError(error, "ledgerJournals", true);
      }
    },
  };

  const auditEvents: AuditEventRepository = {
    async list(projectId, payRunId) {
      scoped(projectId);
      return execute(async (client) => {
        const result = await client.query<AuditRow>(
          `SELECT * FROM public.audit_events
           WHERE project_id = $1::uuid AND pay_run_id = $2 ORDER BY sequence`,
          [projectId, payRunId],
        );
        return result.rows.map(auditFromRow);
      });
    },
    async append(projectId, record) {
      scoped(projectId);
      assertProject(projectId, record.projectId);
      const parsed = auditEventSchema.parse(record);
      try {
        await execute(async (client) => {
          const existing = (await client.query<AuditRow>(
            `SELECT * FROM public.audit_events
             WHERE project_id = $1::uuid AND pay_run_id = $2 ORDER BY sequence`,
            [projectId, parsed.payRunId],
          )).rows.map(auditFromRow);
          appendAuditEvent(existing, parsed);
          await client.query(
            `INSERT INTO public.audit_events
              (project_id, id, pay_run_id, aggregate_type, aggregate_id, sequence,
               before_version, after_version, actor_id, actor_type, action_code,
               reason_code, idempotency_key, correlation_id, occurred_at, details)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                     $12, $13, $14, $15, $16::jsonb)`,
            [projectId, parsed.id, parsed.payRunId, parsed.aggregateType, parsed.aggregateId,
              parsed.sequence, parsed.beforeVersion, parsed.afterVersion, parsed.actor.actorId,
              parsed.actor.actorType, parsed.actionCode, parsed.reasonCode, parsed.idempotencyKey,
              parsed.correlationId, parsed.occurredAt, JSON.stringify(parsed.details)],
          );
        });
      } catch (error) {
        if (error instanceof AuditAppendError || error instanceof InvariantViolationError) {
          throw new AppendOnlyViolationError("auditEvents", error.message);
        }
        mapSqlError(error, "auditEvents", true);
      }
    },
  };

  const domainOutbox: DomainOutboxRepository = {
    async get(projectId, id) {
      scoped(projectId);
      return execute(async (client) => {
        const row = (await client.query<OutboxRow>(
          "SELECT * FROM public.domain_outbox_events WHERE project_id = $1::uuid AND id = $2",
          [projectId, id],
        )).rows[0];
        return row ? outboxFromRow(row) : null;
      });
    },
    async append(projectId, record) {
      scoped(projectId);
      assertProject(projectId, record.projectId);
      const parsed = domainOutboxEventSchema.parse(record);
      try {
        await execute(async (client) => {
          const existing = (await client.query<OutboxRow>(
            `SELECT * FROM public.domain_outbox_events
             WHERE project_id = $1::uuid AND aggregate_id = $2 ORDER BY sequence`,
            [projectId, parsed.aggregateId],
          )).rows.map(outboxFromRow);
          appendDomainOutboxEvent(existing, parsed);
          await client.query(
            `INSERT INTO public.domain_outbox_events
              (project_id, id, aggregate_type, aggregate_id, aggregate_version,
               sequence, event_type, schema_version, payload, occurred_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
            [projectId, parsed.id, parsed.aggregateType, parsed.aggregateId,
              parsed.aggregateVersion, parsed.sequence, parsed.eventType, parsed.schemaVersion,
              JSON.stringify(parsed.payload), parsed.occurredAt],
          );
        });
      } catch (error) {
        if (error instanceof AuditAppendError || error instanceof InvariantViolationError) {
          throw new AppendOnlyViolationError("domainOutboxEvents", error.message);
        }
        mapSqlError(error, "domainOutboxEvents", true);
      }
    },
  };

  const idempotency: IdempotencyRepository = {
    async get(projectId, commandType, key) {
      scoped(projectId);
      return execute(async (client) => parseDocument(
        (await client.query<DocumentRow>(
          `SELECT document FROM public.idempotency_records
           WHERE project_id = $1::uuid AND command_type = $2 AND idempotency_key = $3`,
          [projectId, commandType, key],
        )).rows[0],
        idempotencyRecordSchema,
      ));
    },
    insert: (projectId, record) => insertAggregate({
      table: "idempotency_records", collection: "idempotencyRecords", projectId, record,
      schema: idempotencyRecordSchema, statusColumn: "state", status: record.state,
      extraColumns: ["command_type", "idempotency_key", "request_hash", "result_resource_id",
        "result_version", "response_status", "retention_until"],
      extraValues: [record.commandType, record.key, record.requestHash, record.resultResourceId,
        record.resultVersion, record.responseStatus, record.retentionUntil],
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedState, next) => compareAggregate({
      table: "idempotency_records", projectId, id, expectedVersion, expectedState,
      stateColumn: "state", nextState: next.state, next, schema: idempotencyRecordSchema,
    }),
  };

  const inbox: InboxEventRepository = {
    async get(projectId, source, sourceEventId) {
      scoped(projectId);
      return execute(async (client) => parseDocument(
        (await client.query<DocumentRow>(
          `SELECT document FROM public.inbox_events
           WHERE project_id = $1::uuid AND source = $2 AND source_event_id = $3`,
          [projectId, source, sourceEventId],
        )).rows[0],
        inboxEventSchema,
      ));
    },
    insert: (projectId, record) => insertAggregate({
      table: "inbox_events", collection: "inboxEvents", projectId, record,
      schema: inboxEventSchema, statusColumn: "status", status: record.status,
      extraColumns: ["source", "source_event_id", "payload_digest"],
      extraValues: [record.source, record.sourceEventId, record.payloadDigest],
    }),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) => compareAggregate({
      table: "inbox_events", projectId, id, expectedVersion, expectedState: expectedStatus,
      stateColumn: "status", nextState: next.status, next, schema: inboxEventSchema,
    }),
  };

  return {
    payRuns,
    approvals,
    budgetReservations,
    fundingPreparations,
    paymentExecutions,
    ledger,
    auditEvents,
    domainOutbox,
    idempotency,
    inbox,
  };
}

async function assertSafeSessionRole(client: SqlClient): Promise<string> {
  const result = await client.query<RoleRow>(
    `SELECT session_user AS role_name, rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = session_user`,
  );
  const role = result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.role_name === "service_role") {
    throw new UnsafeDatabaseRoleError(role?.role_name ?? "unknown");
  }
  return role.role_name;
}

export async function openPostgresPayRunStorage(
  options: PostgresStorageOptions,
): Promise<PayRunPersistence> {
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new AdapterClosedError();
  };

  const withTransaction: TransactionExecutor = async (operation) => {
    assertOpen();
    let client: SqlClient;
    try {
      client = await options.pool.connect();
    } catch (error) {
      throw new PersistenceUnavailableError("Hosted Postgres connection is unavailable", {
        cause: error,
      });
    }
    let loginRole = "unknown";
    let phase: "begin" | "session_role" | "assume_role" | "context" | "operation" | "commit" = "begin";
    try {
      await client.query("BEGIN");
      phase = "session_role";
      loginRole = await assertSafeSessionRole(client);
      phase = "assume_role";
      try {
        await client.query("SET LOCAL ROLE zenfix_app");
      } catch (error) {
        if (isConnectionFailure(error)) throw error;
        throw new UnsafeDatabaseRoleError(loginRole, "Database login role cannot assume zenfix_app");
      }
      const effectiveRole = await client.query<RoleRow>(
        `SELECT current_user AS role_name, rolsuper, rolbypassrls
         FROM pg_roles WHERE rolname = current_user`,
      );
      const effective = effectiveRole.rows[0];
      if (!effective || effective.role_name !== "zenfix_app" || effective.rolsuper || effective.rolbypassrls) {
        throw new UnsafeDatabaseRoleError(effective?.role_name ?? "unknown");
      }
      phase = "context";
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [options.context.userId]);
      const owned = await client.query(
        "SELECT id FROM public.projects WHERE id = $1::uuid",
        [options.context.projectId],
      );
      if (owned.rowCount !== 1) {
        throw new ProjectScopeError(options.context.projectId, "not_visible");
      }
      phase = "operation";
      const result = await operation(client);
      phase = "commit";
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      if (phase === "commit" && isConnectionFailure(error)) {
        throw new CommitOutcomeUnknownError({ cause: error });
      }
      if (isConnectionFailure(error)) {
        throw new PersistenceUnavailableError("Hosted Postgres transaction connection was lost", {
          cause: error,
        });
      }
      throw error;
    } finally {
      client.release();
    }
  };

  try {
    await withTransaction(async () => undefined);
  } catch (error) {
    closed = true;
    try {
      await options.pool.end();
    } catch {}
    throw error;
  }
  const repositories = createRepositorySet(withTransaction, options.context.projectId);

  return {
    backend: "postgres",
    ...repositories,
    unitOfWork: {
      execute(projectId, operation) {
        assertProject(options.context.projectId, projectId);
        return withTransaction((client) =>
          operation(createRepositorySet((nested) => nested(client), projectId)),
        );
      },
    },
    async close() {
      if (closed) return;
      closed = true;
      await options.pool.end();
    },
  };
}
