import type {
  ApprovalRepository,
  AuditEventRepository,
  BudgetReservationRepository,
  DomainOutboxRepository,
  FundingPreparationRepository,
  IdempotencyRepository,
  InboxEventRepository,
  LedgerRepository,
  PayRunRepository,
  PayRunUnitOfWork,
  PaymentExecutionRepository,
} from "../../application/ports";
import { AdapterClosedError } from "./errors";
import {
  attachSharedStoreCoordinator,
  type CoordinatorDependencies,
} from "./coordinator";
import { createRepositorySet, createTransactionRepositorySet } from "./repositories";

export interface LocalJsonStorageDiagnostics {
  directoryFsyncUnsupported(details: {
    readonly canonicalStorePath: string;
    readonly code: "EINVAL" | "ENOTSUP" | "EISDIR";
  }): void;
}

export interface LocalJsonPayRunStorageOptions {
  readonly storePath: string;
  readonly now?: () => string;
  readonly nextOperationId?: () => string;
  readonly diagnostics?: LocalJsonStorageDiagnostics;
}

export interface LocalJsonPayRunStorage {
  readonly canonicalStorePath: string;
  readonly payRuns: PayRunRepository;
  readonly approvals: ApprovalRepository;
  readonly budgetReservations: BudgetReservationRepository;
  readonly fundingPreparations: FundingPreparationRepository;
  readonly paymentExecutions: PaymentExecutionRepository;
  readonly ledger: LedgerRepository;
  readonly auditEvents: AuditEventRepository;
  readonly domainOutbox: DomainOutboxRepository;
  readonly idempotency: IdempotencyRepository;
  readonly inbox: InboxEventRepository;
  readonly unitOfWork: PayRunUnitOfWork;
  getStoreGeneration(): Promise<number>;
  close(): Promise<void>;
}

export async function openLocalJsonPayRunStorage(
  options: LocalJsonPayRunStorageOptions,
): Promise<LocalJsonPayRunStorage> {
  return openLocalJsonPayRunStorageWithDependencies(options, {});
}

export async function openLocalJsonPayRunStorageWithDependencies(
  options: LocalJsonPayRunStorageOptions,
  dependencies: CoordinatorDependencies,
): Promise<LocalJsonPayRunStorage> {
  const coordinator = await attachSharedStoreCoordinator({
    storePath: options.storePath,
    now: options.now ?? (() => new Date().toISOString()),
    nextOperationId: options.nextOperationId,
    onDiagnostic: (canonicalStorePath, diagnostic) =>
      options.diagnostics?.directoryFsyncUnsupported({
        canonicalStorePath,
        code: diagnostic.code,
      }),
    dependencies,
  });
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new AdapterClosedError();
  };
  const repositories = createRepositorySet({ coordinator, assertOpen });

  return {
    canonicalStorePath: coordinator.canonicalStorePath,
    ...repositories,
    unitOfWork: {
      async execute(projectId, operation) {
        assertOpen();
        return coordinator.transaction((payload) =>
          operation(createTransactionRepositorySet({ payload, projectId })),
        );
      },
    },
    async getStoreGeneration() {
      assertOpen();
      return coordinator.read((envelope) => envelope.storeGeneration);
    },
    async close() {
      if (closed) return;
      closed = true;
      await coordinator.detach();
    },
  };
}
