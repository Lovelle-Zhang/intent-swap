import type {
  Approval,
  AuditEvent,
  BudgetReservation,
  CompareAndSetResult,
  DomainOutboxEvent,
  ExecutionProof,
  FundingPreparation,
  IdempotencyRecord,
  IdempotencyState,
  InboxEvent,
  LedgerJournal,
  PayIntent,
  PaymentExecution,
  PayRun,
  PayRunStatus,
  PolicyDecision,
  PolicyEvaluationRequest,
} from "../domain/types";

export interface PayRunListQuery {
  readonly statuses?: readonly PayRunStatus[];
  readonly cursor?: string;
  readonly limit?: number;
}

export interface PayRunRepository {
  get(projectId: string, payRunId: string): Promise<PayRun | null>;
  list(projectId: string, query?: PayRunListQuery): Promise<readonly PayRun[]>;
  insert(projectId: string, payRun: PayRun): Promise<void>;
  compareAndSet(
    projectId: string,
    payRunId: string,
    expectedVersion: number,
    expectedStatus: PayRunStatus,
    next: PayRun,
  ): Promise<CompareAndSetResult<PayRun>>;
}

export interface ApprovalRepository {
  get(projectId: string, approvalId: string): Promise<Approval | null>;
  insert(projectId: string, approval: Approval): Promise<void>;
  compareAndSet(
    projectId: string,
    approvalId: string,
    expectedVersion: number,
    expectedStatus: Approval["status"],
    next: Approval,
  ): Promise<CompareAndSetResult<Approval>>;
}

export interface BudgetReservationRepository {
  get(projectId: string, reservationId: string): Promise<BudgetReservation | null>;
  listActive(projectId: string, budgetKeys: readonly string[]): Promise<readonly BudgetReservation[]>;
  insert(projectId: string, reservation: BudgetReservation): Promise<void>;
  compareAndSet(
    projectId: string,
    reservationId: string,
    expectedVersion: number,
    expectedStatus: BudgetReservation["status"],
    next: BudgetReservation,
  ): Promise<CompareAndSetResult<BudgetReservation>>;
}

export interface FundingPreparationRepository {
  get(projectId: string, fundingPreparationId: string): Promise<FundingPreparation | null>;
  insert(projectId: string, fundingPreparation: FundingPreparation): Promise<void>;
  compareAndSet(
    projectId: string,
    fundingPreparationId: string,
    expectedVersion: number,
    expectedStatus: FundingPreparation["status"],
    next: FundingPreparation,
  ): Promise<CompareAndSetResult<FundingPreparation>>;
}

export interface PaymentExecutionRepository {
  get(projectId: string, paymentExecutionId: string): Promise<PaymentExecution | null>;
  insert(projectId: string, paymentExecution: PaymentExecution): Promise<void>;
  compareAndSet(
    projectId: string,
    paymentExecutionId: string,
    expectedVersion: number,
    expectedStatus: PaymentExecution["status"],
    next: PaymentExecution,
  ): Promise<CompareAndSetResult<PaymentExecution>>;
}

export interface LedgerRepository {
  get(projectId: string, journalId: string): Promise<LedgerJournal | null>;
  findByProof(projectId: string, executionProofId: string): Promise<LedgerJournal | null>;
  findByExternalReference(
    projectId: string,
    externalReference: string,
  ): Promise<LedgerJournal | null>;
  append(projectId: string, journal: LedgerJournal): Promise<void>;
}

export interface AuditEventRepository {
  list(projectId: string, payRunId: string): Promise<readonly AuditEvent[]>;
  append(projectId: string, event: AuditEvent): Promise<void>;
}

export interface DomainOutboxRepository {
  get(projectId: string, eventId: string): Promise<DomainOutboxEvent | null>;
  append(projectId: string, event: DomainOutboxEvent): Promise<void>;
}

export interface InboxEventRepository {
  get(projectId: string, source: string, sourceEventId: string): Promise<InboxEvent | null>;
  insert(projectId: string, event: InboxEvent): Promise<void>;
  compareAndSet(
    projectId: string,
    inboxEventId: string,
    expectedVersion: number,
    expectedStatus: InboxEvent["status"],
    next: InboxEvent,
  ): Promise<CompareAndSetResult<InboxEvent>>;
}

export interface IdempotencyRepository {
  get(projectId: string, commandType: string, key: string): Promise<IdempotencyRecord | null>;
  insert(projectId: string, record: IdempotencyRecord): Promise<void>;
  compareAndSet(
    projectId: string,
    idempotencyRecordId: string,
    expectedVersion: number,
    expectedState: IdempotencyState,
    next: IdempotencyRecord,
  ): Promise<CompareAndSetResult<IdempotencyRecord>>;
}

export interface PayRunUnitOfWorkContext {
  readonly payRuns: PayRunRepository;
  readonly approvals: ApprovalRepository;
  readonly budgetReservations: BudgetReservationRepository;
  readonly fundingPreparations: FundingPreparationRepository;
  readonly paymentExecutions: PaymentExecutionRepository;
  readonly ledger: LedgerRepository;
  readonly auditEvents: AuditEventRepository;
  readonly domainOutbox: DomainOutboxRepository;
  readonly idempotency: IdempotencyRepository;
  readonly inbox?: InboxEventRepository;
}

export interface PayRunUnitOfWork {
  execute<T>(
    projectId: string,
    operation: (context: PayRunUnitOfWorkContext) => Promise<T>,
  ): Promise<T>;
}

export interface PayRunPersistence extends PayRunUnitOfWorkContext {
  readonly backend: "local_json" | "postgres";
  readonly inbox: InboxEventRepository;
  readonly unitOfWork: PayRunUnitOfWork;
  close(): Promise<void>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(projectId: string, kind: string): string;
}

export interface PolicyDecisionPort {
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;
}

export interface FundingPreparationPort {
  prepare(
    projectId: string,
    payRunId: string,
    intent: PayIntent,
    allowedDecision: PolicyDecision,
  ): Promise<FundingPreparation>;
}

export interface PaymentExecutionPort {
  prepare(
    projectId: string,
    payRunId: string,
    fundingPreparation: FundingPreparation,
  ): Promise<PaymentExecution>;
}

export interface ExecutionProofPort {
  collect(
    projectId: string,
    payRunId: string,
    paymentExecution: PaymentExecution,
  ): Promise<ExecutionProof>;
}
