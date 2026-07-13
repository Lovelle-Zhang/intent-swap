import type {
  ApprovalRepository,
  AuditEventRepository,
  DomainOutboxRepository,
  FundingPreparationRepository,
  IdempotencyRepository,
  InboxEventRepository,
  LedgerRepository,
  PayRunListQuery,
  PayRunRepository,
  PayRunUnitOfWorkContext,
  PaymentExecutionRepository,
} from "../../application/ports";
import { InvariantViolationError, ProjectScopeError, VersionConflictError } from "../../domain/errors";
import { appendAuditEvent, appendDomainOutboxEvent } from "../../domain/invariants";
import {
  approvalSchema,
  auditEventSchema,
  domainOutboxEventSchema,
  fundingPreparationSchema,
  idempotencyRecordSchema,
  ledgerJournalSchema,
  paymentExecutionSchema,
  payRunSchema,
  type RuntimeSchema,
} from "../../domain/schemas";
import type {
  AggregateRoot,
  Approval,
  AuditEvent,
  CompareAndSetResult,
  DomainOutboxEvent,
  FundingPreparation,
  IdempotencyRecord,
  InboxEvent,
  LedgerJournal,
  PaymentExecution,
  PayRun,
} from "../../domain/types";
import { canonicalClone } from "./canonical-json";
import type { MutableLocalJsonStorePayload, SharedStoreCoordinator } from "./coordinator";
import { AppendOnlyViolationError, DuplicateRecordError } from "./errors";

export interface RepositorySet extends PayRunUnitOfWorkContext {
  readonly inbox: InboxEventRepository;
}

interface RepositoryFactoryOptions {
  readonly coordinator: SharedStoreCoordinator;
  readonly assertOpen: () => void;
}

interface TransactionRepositoryFactoryOptions {
  readonly payload: MutableLocalJsonStorePayload;
  readonly projectId: string;
}

type MutableCollectionName = {
  [K in keyof MutableLocalJsonStorePayload]: MutableLocalJsonStorePayload[K] extends AggregateRoot[]
    ? K
    : never;
}[keyof MutableLocalJsonStorePayload];

export function createRepositorySet(options: RepositoryFactoryOptions): RepositorySet {
  const { coordinator, assertOpen } = options;

  async function guardedRead<T>(
    operation: Parameters<SharedStoreCoordinator["read"]>[0],
  ): Promise<T> {
    assertOpen();
    return coordinator.read(operation) as Promise<T>;
  }

  async function guardedMutation<T>(
    operation: (payload: MutableLocalJsonStorePayload) => T | Promise<T>,
  ): Promise<T> {
    assertOpen();
    return coordinator.mutate(operation);
  }

  async function insertAggregate<T extends AggregateRoot>(
    projectId: string,
    record: T,
    collection: MutableCollectionName,
    schema: RuntimeSchema<T>,
  ): Promise<void> {
    assertProject(projectId, record.projectId);
    const parsed = schema.parse(record);
    await guardedMutation((payload) => {
      const records = payload[collection] as unknown as T[];
      if (records.some((existing) => existing.projectId === projectId && existing.id === parsed.id)) {
        throw new DuplicateRecordError(collection);
      }
      records.push(parsed);
    });
  }

  async function compareAggregate<T extends AggregateRoot, S>(input: {
    readonly projectId: string;
    readonly aggregateId: string;
    readonly expectedVersion: number;
    readonly expectedState: S;
    readonly next: T;
    readonly collection: MutableCollectionName;
    readonly schema: RuntimeSchema<T>;
    readonly stateOf: (record: T) => S;
  }): Promise<CompareAndSetResult<T>> {
    assertProject(input.projectId, input.next.projectId);
    return guardedMutation((payload) => {
      const records = payload[input.collection] as unknown as T[];
      const index = records.findIndex(
        (record) => record.projectId === input.projectId && record.id === input.aggregateId,
      );
      const current = records[index];
      if (
        !current ||
        current.version !== input.expectedVersion ||
        input.stateOf(current) !== input.expectedState
      ) {
        throw new VersionConflictError(
          input.expectedVersion,
          current?.version ?? 0,
          input.aggregateId,
        );
      }
      if (input.next.id !== current.id) {
        throw new InvariantViolationError("CAS cannot change aggregate identity", {
          aggregateId: input.aggregateId,
        });
      }
      if (input.next.createdAt !== current.createdAt) {
        throw new InvariantViolationError("CAS cannot change aggregate creation identity", {
          aggregateId: input.aggregateId,
        });
      }
      if (input.next.version !== input.expectedVersion + 1) {
        throw new VersionConflictError(input.expectedVersion + 1, input.next.version, input.aggregateId);
      }
      const parsed = input.schema.parse(input.next);
      records[index] = parsed;
      return { kind: "updated", value: parsed } as const;
    });
  }

  function getById<T>(collection: keyof MutableLocalJsonStorePayload, projectId: string, id: string) {
    return guardedRead<T | null>((envelope) => {
      const records = envelope.payload[collection] as readonly { projectId: string; id: string }[];
      const record = records.find((candidate) => candidate.projectId === projectId && candidate.id === id);
      return record ? canonicalClone(record) : null;
    });
  }

  const payRuns: PayRunRepository = {
    get(projectId, payRunId) {
      return getById<PayRun>("payRuns", projectId, payRunId);
    },
    list(projectId, query: PayRunListQuery = {}) {
      return guardedRead<readonly PayRun[]>((envelope) => {
        let records = envelope.payload.payRuns.filter(
          (record) =>
            record.projectId === projectId &&
            (query.statuses === undefined || query.statuses.includes(record.status)),
        );
        if (query.cursor !== undefined) {
          const cursorIndex = records.findIndex((record) => record.id === query.cursor);
          records = cursorIndex < 0 ? [] : records.slice(cursorIndex + 1);
        }
        if (query.limit !== undefined) records = records.slice(0, query.limit);
        return canonicalClone(records);
      });
    },
    insert(projectId, payRun) {
      return insertAggregate(projectId, payRun, "payRuns", payRunSchema);
    },
    compareAndSet(projectId, payRunId, expectedVersion, expectedStatus, next) {
      return compareAggregate({
        projectId,
        aggregateId: payRunId,
        expectedVersion,
        expectedState: expectedStatus,
        next,
        collection: "payRuns",
        schema: payRunSchema,
        stateOf: (record) => record.status,
      });
    },
  };

  const approvals: ApprovalRepository = {
    get: (projectId, id) => getById<Approval>("approvals", projectId, id),
    insert: (projectId, record) => insertAggregate(projectId, record, "approvals", approvalSchema),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) =>
      compareAggregate({
        projectId,
        aggregateId: id,
        expectedVersion,
        expectedState: expectedStatus,
        next,
        collection: "approvals",
        schema: approvalSchema,
        stateOf: (record) => record.status,
      }),
  };

  const fundingPreparations: FundingPreparationRepository = {
    get: (projectId, id) => getById<FundingPreparation>("fundingPreparations", projectId, id),
    insert: (projectId, record) =>
      insertAggregate(projectId, record, "fundingPreparations", fundingPreparationSchema),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) =>
      compareAggregate({
        projectId,
        aggregateId: id,
        expectedVersion,
        expectedState: expectedStatus,
        next,
        collection: "fundingPreparations",
        schema: fundingPreparationSchema,
        stateOf: (record) => record.status,
      }),
  };

  const paymentExecutions: PaymentExecutionRepository = {
    get: (projectId, id) => getById<PaymentExecution>("paymentExecutions", projectId, id),
    insert: (projectId, record) =>
      insertAggregate(projectId, record, "paymentExecutions", paymentExecutionSchema),
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) =>
      compareAggregate({
        projectId,
        aggregateId: id,
        expectedVersion,
        expectedState: expectedStatus,
        next,
        collection: "paymentExecutions",
        schema: paymentExecutionSchema,
        stateOf: (record) => record.status,
      }),
  };

  const ledger: LedgerRepository = {
    get: (projectId, id) => getById<LedgerJournal>("ledgerJournals", projectId, id),
    findByProof(projectId, executionProofId) {
      return guardedRead((envelope) =>
        canonicalClone(
          envelope.payload.ledgerJournals.find(
            (record) =>
              record.projectId === projectId && record.executionProofId === executionProofId,
          ) ?? null,
        ),
      );
    },
    findByExternalReference(projectId, externalReference) {
      return guardedRead((envelope) =>
        canonicalClone(
          envelope.payload.ledgerJournals.find(
            (record) =>
              record.projectId === projectId && record.externalReference === externalReference,
          ) ?? null,
        ),
      );
    },
    async append(projectId, record) {
      assertProject(projectId, record.projectId);
      const parsed = ledgerJournalSchema.parse(record);
      await guardedMutation((payload) => {
        const collision = payload.ledgerJournals.find(
          (candidate) =>
            candidate.projectId === projectId &&
            (candidate.id === parsed.id ||
              candidate.executionProofId === parsed.executionProofId ||
              candidate.externalReference === parsed.externalReference),
        );
        if (collision) {
          throw new AppendOnlyViolationError(
            "ledgerJournals",
            "Ledger identity, execution proof, and external reference must be unique within a project",
          );
        }
        payload.ledgerJournals.push(parsed);
      });
    },
  };

  const auditEvents: AuditEventRepository = {
    list(projectId, payRunId) {
      return guardedRead((envelope) =>
        canonicalClone(
          envelope.payload.auditEvents
            .filter((event) => event.projectId === projectId && event.payRunId === payRunId)
            .sort((left, right) => left.sequence - right.sequence),
        ),
      );
    },
    async append(projectId, event) {
      assertProject(projectId, event.projectId);
      const parsed = auditEventSchema.parse(event);
      await guardedMutation((payload) => {
        if (
          payload.auditEvents.some(
            (candidate) => candidate.projectId === projectId && candidate.id === parsed.id,
          )
        ) {
          throw new AppendOnlyViolationError("auditEvents", "Audit event identity must be unique");
        }
        const lineage = payload.auditEvents
          .filter(
            (candidate) =>
              candidate.projectId === projectId &&
              candidate.aggregateType === parsed.aggregateType &&
              candidate.aggregateId === parsed.aggregateId,
          )
          .sort((left, right) => left.sequence - right.sequence);
        try {
          payload.auditEvents = [
            ...payload.auditEvents,
            ...appendAuditEvent(lineage, parsed).slice(lineage.length),
          ];
        } catch (error) {
          throw new AppendOnlyViolationError(
            "auditEvents",
            error instanceof Error ? error.message : undefined,
          );
        }
      });
    },
  };

  const domainOutbox: DomainOutboxRepository = {
    get: (projectId, id) => getById<DomainOutboxEvent>("domainOutboxEvents", projectId, id),
    async append(projectId, event) {
      assertProject(projectId, event.projectId);
      const parsed = domainOutboxEventSchema.parse(event);
      await guardedMutation((payload) => {
        if (
          payload.domainOutboxEvents.some(
            (candidate) => candidate.projectId === projectId && candidate.id === event.id,
          )
        ) {
          throw new AppendOnlyViolationError(
            "domainOutboxEvents",
            "Domain Outbox event identity must be unique",
          );
        }
        const lineage = payload.domainOutboxEvents
          .filter(
            (candidate) =>
              candidate.projectId === projectId &&
              candidate.aggregateType === parsed.aggregateType &&
              candidate.aggregateId === parsed.aggregateId,
          )
          .sort((left, right) => left.sequence - right.sequence);
        try {
          payload.domainOutboxEvents = [
            ...payload.domainOutboxEvents,
            ...appendDomainOutboxEvent(lineage, parsed).slice(lineage.length),
          ];
        } catch (error) {
          throw new AppendOnlyViolationError(
            "domainOutboxEvents",
            error instanceof Error ? error.message : undefined,
          );
        }
      });
    },
  };

  const idempotency: IdempotencyRepository = {
    get(projectId, commandType, key) {
      return guardedRead((envelope) =>
        canonicalClone(
          envelope.payload.idempotencyRecords.find(
            (record) =>
              record.projectId === projectId &&
              record.commandType === commandType &&
              record.key === key,
          ) ?? null,
        ),
      );
    },
    async insert(projectId, record) {
      assertProject(projectId, record.projectId);
      const parsed = idempotencyRecordSchema.parse(record);
      await guardedMutation((payload) => {
        if (
          payload.idempotencyRecords.some(
            (candidate) =>
              candidate.projectId === projectId &&
              (candidate.id === parsed.id ||
                (candidate.commandType === parsed.commandType && candidate.key === parsed.key)),
          )
        ) {
          throw new DuplicateRecordError("idempotencyRecords");
        }
        payload.idempotencyRecords.push(parsed);
      });
    },
    compareAndSet: (projectId, id, expectedVersion, expectedState, next) =>
      compareAggregate({
        projectId,
        aggregateId: id,
        expectedVersion,
        expectedState,
        next,
        collection: "idempotencyRecords",
        schema: idempotencyRecordSchema,
        stateOf: (record) => record.state,
      }),
  };

  const inbox: InboxEventRepository = {
    get(projectId, source, sourceEventId) {
      return guardedRead((envelope) =>
        canonicalClone(
          envelope.payload.inboxEvents.find(
            (record) =>
              record.projectId === projectId &&
              record.source === source &&
              record.sourceEventId === sourceEventId,
          ) ?? null,
        ),
      );
    },
    async insert(projectId, record) {
      assertProject(projectId, record.projectId);
      await guardedMutation((payload) => {
        if (
          payload.inboxEvents.some(
            (candidate) =>
              candidate.projectId === projectId &&
              (candidate.id === record.id ||
                (candidate.source === record.source &&
                  candidate.sourceEventId === record.sourceEventId)),
          )
        ) {
          throw new DuplicateRecordError("inboxEvents");
        }
        payload.inboxEvents.push(canonicalClone(record));
      });
    },
    compareAndSet: (projectId, id, expectedVersion, expectedStatus, next) =>
      compareAggregate({
        projectId,
        aggregateId: id,
        expectedVersion,
        expectedState: expectedStatus,
        next,
        collection: "inboxEvents",
        schema: {
          parse: (value: unknown) => canonicalClone(value as InboxEvent),
          safeParse: unsupportedSafeParse,
        },
        stateOf: (record) => record.status,
      }),
  };

  return {
    payRuns,
    approvals,
    fundingPreparations,
    paymentExecutions,
    ledger,
    auditEvents,
    domainOutbox,
    idempotency,
    inbox,
  };
}

export function createTransactionRepositorySet(
  options: TransactionRepositoryFactoryOptions,
): RepositorySet {
  const memoryCoordinator = {
    read<T>(operation: Parameters<SharedStoreCoordinator["read"]>[0]): Promise<T> {
      return Promise.resolve(
        operation({ payload: options.payload } as unknown as Parameters<typeof operation>[0]),
      ) as Promise<T>;
    },
    mutate<T>(
      operation: (payload: MutableLocalJsonStorePayload) => T | Promise<T>,
    ): Promise<T> {
      return Promise.resolve(operation(options.payload));
    },
  } as SharedStoreCoordinator;

  return scopeRepositorySet(
    createRepositorySet({ coordinator: memoryCoordinator, assertOpen: () => undefined }),
    options.projectId,
  );
}

function scopeRepositorySet(repositories: RepositorySet, projectId: string): RepositorySet {
  return Object.fromEntries(
    Object.entries(repositories).map(([name, repository]) => [
      name,
      new Proxy(repository, {
        get(target, property, receiver) {
          const member = Reflect.get(target, property, receiver) as unknown;
          if (typeof member !== "function") return member;
          return (...args: unknown[]) => {
            const requestedProjectId = args[0];
            if (requestedProjectId !== projectId) {
              throw new ProjectScopeError(projectId, String(requestedProjectId));
            }
            return Reflect.apply(member, target, args);
          };
        },
      }),
    ]),
  ) as unknown as RepositorySet;
}

function assertProject(expectedProjectId: string, actualProjectId: string): void {
  if (expectedProjectId !== actualProjectId) {
    throw new ProjectScopeError(expectedProjectId, actualProjectId);
  }
}

function unsupportedSafeParse<T>(): ReturnType<RuntimeSchema<T>["safeParse"]> {
  throw new Error("safeParse is not used by Local JSON repositories");
}
