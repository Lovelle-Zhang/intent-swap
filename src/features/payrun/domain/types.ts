export type ISO8601 = string;
export type AtomicAmount = string;
export type Digest = string;
export type ProjectId = string;
export type PayRunEnvironment = "sandbox" | "live_guarded";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface AggregateRoot {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly version: number;
  readonly createdAt: ISO8601;
  readonly updatedAt: ISO8601;
}

export interface ProjectScopedRecord {
  readonly id: string;
  readonly projectId: ProjectId;
}

export interface Project extends AggregateRoot {
  readonly mode: PayRunEnvironment;
  readonly killSwitchActive: boolean;
  readonly defaultSettlementTarget: LogicalSettlementTarget;
}

export interface Agent extends AggregateRoot {
  readonly ownerId: string;
  readonly status: "active" | "inactive" | "blocked";
  readonly policyId: string;
  readonly capabilities: readonly string[];
}

export type MerchantTrustState = "known" | "new" | "unknown" | "blocked";

export interface Merchant extends AggregateRoot {
  readonly payee: string;
  readonly category: string;
  readonly trustState: MerchantTrustState;
  readonly settlementTarget: LogicalSettlementTarget;
}

export interface Policy extends AggregateRoot {
  readonly policyVersion: number;
  readonly checksum: Digest;
  readonly effectiveFrom: ISO8601;
  readonly effectiveUntil: ISO8601 | null;
  readonly active: boolean;
}

export interface LogicalSettlementTarget {
  readonly kind: "logical";
  readonly chainFamily: "base";
  readonly asset: "USDC";
  readonly decimals: 6;
}

export interface OnChainAssetRef {
  readonly kind: "on_chain";
  readonly environment: "live_guarded";
  readonly chainId: number;
  readonly contractAddress: string;
  readonly asset: string;
  readonly decimals: number;
  readonly configVersion: string;
}

export type SettlementRef = LogicalSettlementTarget | OnChainAssetRef;

export interface Money {
  readonly amountAtomic: AtomicAmount;
  readonly asset: string;
  readonly settlementRef: SettlementRef;
  readonly decimals: number;
}

export interface MerchantReference {
  readonly merchantId: string;
  readonly payee: string;
  readonly category: string;
  readonly trustState: MerchantTrustState;
}

export interface FundingSource {
  readonly chainFamily: string;
  readonly asset: string;
  readonly accountRef: string;
  readonly amountAtomic: AtomicAmount;
  readonly decimals: number;
}

export type PayIntentSource = "api" | "sdk" | "simulator" | "workflow" | "manual";

export interface PayIntent extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly source: PayIntentSource;
  readonly agentId: string;
  readonly taskId: string;
  readonly purpose: string;
  readonly merchant: MerchantReference;
  readonly maximumAmount: Money;
  readonly quotedAmount: Money;
  readonly expectedArtifactType: string;
  readonly requestedFundingSource?: FundingSource;
  readonly settlementTarget: LogicalSettlementTarget;
  readonly createdAt: ISO8601;
  readonly expiresAt: ISO8601;
  readonly digest: Digest;
}

export type PolicyDecisionOutcome = "allowed" | "needs_review" | "blocked";
export type PolicyCheckOutcome = "pass" | "review" | "block";
export type PolicyRuleClass =
  | "structural"
  | "emergency"
  | "identity"
  | "payee"
  | "settlement"
  | "hard_limit"
  | "review"
  | "evidence";

export interface PolicyCheck {
  readonly sequence: number;
  readonly ruleClass: PolicyRuleClass;
  readonly reasonCode: string;
  readonly outcome: PolicyCheckOutcome;
  readonly explanation: string;
  readonly satisfiedByApprovalDecisionId?: string;
}

export interface PolicyEvaluator {
  readonly service: "zenfix_policy_engine";
  readonly engineVersion: string;
}

export interface PolicySnapshot {
  readonly projectId: ProjectId;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyChecksum: Digest;
  readonly inputSnapshotDigest: Digest;
}

export interface PolicyRuleSnapshot {
  readonly allowedMerchantIds: readonly string[];
  readonly blockedMerchantIds: readonly string[];
  readonly blockedCategories: readonly string[];
  readonly allowedRails: readonly string[];
  readonly transactionLimit: Money;
  readonly absoluteHardLimit: Money;
  readonly reviewThreshold: Money;
  readonly requireReviewForNewMerchant: boolean;
  readonly allowedArtifactTypes: readonly string[];
}

export interface PolicyEvaluationSnapshot extends PolicySnapshot {
  readonly effectiveFrom: ISO8601;
  readonly effectiveUntil: ISO8601 | null;
  readonly active: boolean;
  readonly rules: PolicyRuleSnapshot;
}

export interface PolicyDecisionValue {
  readonly outcome: PolicyDecisionOutcome;
  readonly reasonCodes: readonly string[];
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly nextAction: "prepare_funding" | "request_approval" | "stop";
}

export interface PolicyDecision extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly payIntentId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyChecksum: Digest;
  readonly engineVersion: string;
  readonly inputSnapshotDigest: Digest;
  readonly outcome: PolicyDecisionOutcome;
  readonly checks: readonly PolicyCheck[];
  readonly reasonCodes: readonly string[];
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly evaluatedAt: ISO8601;
  readonly validUntil: ISO8601;
  readonly nextAction: "prepare_funding" | "request_approval" | "stop";
  readonly authorizationBasisApprovalDecisionId?: string;
  readonly evaluatedBy: PolicyEvaluator;
  readonly policySnapshot: PolicySnapshot;
  readonly decision: PolicyDecisionValue;
}

export type CanonicalPolicyDecision = PolicyDecision;

export interface PolicyRecheckContext {
  readonly approvalDecisionId: string;
  readonly approvedScopeDigest: Digest;
  readonly coveredReasonCodes: readonly string[];
}

export interface PolicyEvaluationAttempt extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly attempt: number;
  readonly startedAt: ISO8601;
  readonly errorCode?: string;
  readonly retryable?: boolean;
  readonly recheckContext?: PolicyRecheckContext;
}

export interface ApprovalRequest extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly payIntentId: string;
  readonly createdAt: ISO8601;
  readonly expiresAt: ISO8601;
  readonly createdAtPayRunVersion: number;
  readonly intentDigest: Digest;
  readonly policyDecisionId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyChecksum: Digest;
  readonly policyEvaluationDigest: Digest;
  readonly agentId: string;
  readonly merchantId: string;
  readonly purpose: string;
  readonly amount: Money;
  readonly amountCeiling: Money;
  readonly settlementTarget: LogicalSettlementTarget;
  readonly rail: string;
  readonly fundingScopeDigest: Digest;
  readonly coveredReasonCodes: readonly string[];
  readonly approvalScopeDigest: Digest;
  readonly generation: number;
  readonly requester: DomainActor;
}

export interface ApprovalDecision extends ProjectScopedRecord {
  readonly approvalId: string;
  readonly payRunId: string;
  readonly outcome: "approved" | "denied";
  readonly reviewerId: string;
  readonly approver: DomainActor;
  readonly decidedAt: ISO8601;
  readonly reasonCode: string;
  readonly approvalScopeDigest: Digest;
}

export interface Approval extends AggregateRoot {
  readonly payRunId: string;
  readonly status: "pending" | "approved" | "denied" | "expired";
  readonly request: ApprovalRequest;
  readonly decision?: ApprovalDecision;
}

export const BUDGET_RESERVATION_STATUS_VALUES = ["active", "released", "consumed"] as const;
export type BudgetReservationStatus = (typeof BUDGET_RESERVATION_STATUS_VALUES)[number];

export interface BudgetReservation extends AggregateRoot {
  readonly payRunId: string;
  readonly agentId: string;
  readonly merchantId: string;
  readonly rail: string;
  readonly scopeGeneration: number;
  readonly policyDecisionId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyChecksum: Digest;
  readonly policyEvaluationDigest: Digest;
  readonly intentDigest: Digest;
  readonly approvalScopeDigest: Digest | null;
  readonly approvalDecisionId: string | null;
  readonly fundingScopeDigest: Digest;
  readonly budgetKeys: readonly string[];
  readonly reservedAmount: Money;
  readonly environment: PayRunEnvironment;
  readonly expiresAt: ISO8601;
  readonly status: BudgetReservationStatus;
  readonly terminalReasonCode: string | null;
  readonly terminalEvidence:
    | EvidenceReference
    | { readonly ledgerJournalId: string }
    | null;
}

export const EVIDENCE_KINDS = [
  "sandbox_funding_evidence",
  "sandbox_payment_evidence",
  "sandbox_execution_proof",
  "sandbox_no_transfer_evidence",
  "sandbox_safe_release_evidence",
  "sandbox_expiry_evidence",
  "guarded_funding_evidence",
  "guarded_payment_evidence",
  "guarded_execution_proof",
  "guarded_no_transfer_evidence",
  "guarded_safe_release_evidence",
  "guarded_expiry_evidence",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface EvidenceReference {
  readonly environment: PayRunEnvironment;
  readonly kind: EvidenceKind;
  readonly provider: string;
  readonly reference: string;
  readonly observedStatus: string;
  readonly checksum: Digest;
  readonly capturedAt: ISO8601;
  readonly verificationMethod: string;
  readonly synthetic: boolean;
  readonly transactionHash: string | null;
}

export type FundingProofKind =
  | "sandbox_funding_evidence"
  | "guarded_funding_evidence";
export type PaymentProofKind =
  | "sandbox_payment_evidence"
  | "guarded_payment_evidence";
export type ExecutionProofKind =
  | "sandbox_execution_proof"
  | "guarded_execution_proof";
export type NoTransferProofKind =
  | "sandbox_no_transfer_evidence"
  | "guarded_no_transfer_evidence";

export interface FundingProof extends EvidenceReference {
  readonly kind: FundingProofKind;
}

export interface PaymentProof extends EvidenceReference {
  readonly kind: PaymentProofKind;
}

export interface ExecutionEvidence extends EvidenceReference {
  readonly kind: ExecutionProofKind;
}

export interface NoTransferProof extends EvidenceReference {
  readonly kind: NoTransferProofKind;
}

export type FundingAction = "none" | "swap" | "bridge" | "swap_and_bridge";
export type FundingPreparationStatus =
  | "requested"
  | "not_required"
  | "planned"
  | "sandbox_prepared"
  | "prepared"
  | "unsupported"
  | "failed"
  | "expired";

export interface FundingRouteStep {
  readonly sequence: number;
  readonly action: "swap" | "bridge";
  readonly from: string;
  readonly to: string;
  readonly description: string;
  readonly simulated: boolean;
}

export type FundingAttemptOutcome =
  | "prepared"
  | "submitted"
  | "unknown"
  | "final_success"
  | "final_failure";

export interface FundingAttempt extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly fundingPreparationId: string;
  readonly executionKey: string;
  readonly planDigest: Digest;
  readonly outcome: FundingAttemptOutcome;
  readonly createdAt: ISO8601;
  readonly evidence?: FundingProof | NoTransferProof;
}

export interface FundingPreparation extends AggregateRoot {
  readonly payRunId: string;
  readonly budgetReservationId: string;
  readonly intentDigest: Digest;
  readonly policyDecisionId: string;
  readonly approvedScopeDigest: Digest;
  readonly idempotencyKey: string;
  readonly source: FundingSource;
  readonly requiredTarget: LogicalSettlementTarget;
  readonly requestedAmount: Money;
  readonly action: FundingAction;
  readonly route: readonly FundingRouteStep[];
  readonly attempts: readonly FundingAttempt[];
  readonly status: FundingPreparationStatus;
  readonly planDigest: Digest;
  readonly quoteReference: string | null;
  readonly expiresAt: ISO8601;
  readonly evidence?: EvidenceReference;
  readonly transactionHash: string | null;
  readonly realFundsAvailable: boolean;
  readonly realBridgeCapability: boolean;
}

export type CanonicalFundingPreparation = FundingPreparation & {
  readonly evidence?: FundingProof;
};

export interface PaymentInstruction extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly fundingPreparationId: string;
  readonly merchantId: string;
  readonly rail: string;
  readonly amount: Money;
  readonly target: LogicalSettlementTarget;
  readonly instructionHash: Digest;
  readonly executionKey: string;
  readonly createdAt: ISO8601;
}

export type ExecutionAttemptOutcome =
  | "prepared"
  | "submitted"
  | "unknown"
  | "final_success"
  | "final_failure";

export interface ExecutionAttempt extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly paymentExecutionId: string;
  readonly executionKey: string;
  readonly instructionHash: Digest;
  readonly outcome: ExecutionAttemptOutcome;
  readonly createdAt: ISO8601;
}

export type PaymentExecutionStatus =
  | "prepared"
  | "submitted"
  | "succeeded"
  | "unknown"
  | "failed_no_transfer";

export interface PaymentExecution extends AggregateRoot {
  readonly payRunId: string;
  readonly instruction: PaymentInstruction;
  readonly status: PaymentExecutionStatus;
  readonly providerReference: string | null;
  readonly evidence?: EvidenceReference;
  readonly reconciliationState: "not_required" | "scheduled" | "reconciling" | "resolved";
  readonly attempts: readonly ExecutionAttempt[];
}

export interface CanonicalPaymentExecution extends PaymentExecution {
  readonly evidence?: PaymentProof | NoTransferProof;
}

export interface ExecutionProofRequest extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly paymentExecutionId: string;
  readonly artifactType: string;
  readonly provider: string;
  readonly createdAt: ISO8601;
}

export interface ExecutionProof extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly paymentExecutionId: string;
  readonly requestId: string;
  readonly provider: string;
  readonly artifactType: string;
  readonly artifactReference: string;
  readonly checksum: Digest;
  readonly verificationStatus: "verified" | "unverified";
  readonly outcome: "positive" | "negative";
  readonly evidence: EvidenceReference;
  readonly capturedAt: ISO8601;
}

export interface ArtifactProof {
  readonly projectId: ProjectId;
  readonly payRunId: string;
  readonly paymentExecutionId: string;
  readonly requestId: string;
  readonly provider: string;
  readonly artifactType: string;
  readonly artifactReference: string;
  readonly checksum: Digest;
  readonly verificationStatus: "verified" | "unverified";
  readonly capturedAt: ISO8601;
}

export interface CanonicalExecutionProof extends ExecutionProof {
  readonly artifactProof: ArtifactProof;
  readonly evidence: ExecutionEvidence;
}

export const SANDBOX_LEDGER_ACCOUNT_ROLES = [
  "sandbox_funding_source",
  "sandbox_merchant_payable",
  "sandbox_fee_account",
  "sandbox_clearing",
] as const;
export type SandboxLedgerAccountRole = (typeof SANDBOX_LEDGER_ACCOUNT_ROLES)[number];

export interface LedgerEntry extends ProjectScopedRecord {
  readonly journalId: string;
  readonly accountId: string;
  readonly accountRole: string;
  readonly debitAtomic: AtomicAmount;
  readonly creditAtomic: AtomicAmount;
  readonly evidenceHash: Digest;
}

export interface LedgerDraft extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly paymentExecutionId: string;
  readonly executionProofId: string;
  readonly environment: PayRunEnvironment;
  readonly assetRef: SettlementRef;
  readonly externalReference: string;
  readonly evidenceHash: Digest;
  readonly entries: readonly LedgerEntry[];
  readonly preparedAt: ISO8601;
}

export interface LedgerJournal extends AggregateRoot {
  readonly payRunId: string;
  readonly paymentExecutionId: string;
  readonly executionProofId: string;
  readonly environment: PayRunEnvironment;
  readonly assetRef: SettlementRef;
  readonly externalReference: string;
  readonly evidenceHash: Digest;
  readonly entries: readonly LedgerEntry[];
  readonly committedAt: ISO8601;
  readonly reversalOfJournalId?: string;
}

export interface DomainActor {
  readonly actorId: string;
  readonly actorType: "agent" | "user" | "system" | "worker";
}

export interface AuditEvent extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly aggregateType: "PayRun";
  readonly aggregateId: string;
  readonly sequence: number;
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly actor: DomainActor;
  readonly actionCode: string;
  readonly reasonCode: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly occurredAt: ISO8601;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface DomainOutboxEvent extends ProjectScopedRecord {
  readonly aggregateType: "PayRun";
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly sequence: number;
  readonly eventType: "payrun.created" | "payrun.transitioned";
  readonly schemaVersion: number;
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly occurredAt: ISO8601;
}

export type IdempotencyState = "in_progress" | "completed" | "unknown";

export interface IdempotencyRecord extends AggregateRoot {
  readonly commandType: string;
  readonly key: string;
  readonly requestHash: Digest;
  readonly state: IdempotencyState;
  readonly resultResourceId: string | null;
  readonly resultVersion: number | null;
  readonly responseStatus: number | null;
  readonly retentionUntil: ISO8601;
}

export interface InboxEvent extends AggregateRoot {
  readonly source: string;
  readonly sourceEventId: string;
  readonly status: "received" | "consumed";
  readonly payloadDigest: Digest;
  readonly consumedAt?: ISO8601;
}

export interface ExpiryRecord {
  readonly expiredAtStage: PayRunStatus;
  readonly reasonCode: string;
  readonly expiredAt: ISO8601;
  readonly evidence: EvidenceReference;
  readonly externalEffectPossible: boolean;
  readonly safeReleaseEvidence?: EvidenceReference;
}

export interface CancellationRecord extends ProjectScopedRecord {
  readonly payRunId: string;
  readonly status: "pending" | "cancelled";
  readonly requestedBy: string;
  readonly requestedAt: ISO8601;
  readonly externalEffectPossible: boolean;
  readonly reasonCode: string;
  readonly completedAt?: ISO8601;
  readonly safeReleaseEvidence?: EvidenceReference;
}

export interface FailureRecord {
  readonly stage: PayRunStatus;
  readonly reasonCode: string;
  readonly failedAt: ISO8601;
  readonly externalEffectAttempted: boolean;
  readonly noValueMovedEvidence?: EvidenceReference;
}

export const PAY_RUN_STATUS_VALUES = [
  "intent_recorded",
  "policy_evaluating",
  "policy_allowed",
  "pending_review",
  "approved",
  "funding_preparing",
  "funding_prepared",
  "payment_executing",
  "payment_unknown",
  "payment_succeeded",
  "proof_collecting",
  "proof_collected",
  "ledger_recording",
  "completed",
  "blocked",
  "denied",
  "expired",
  "cancellation_pending",
  "cancelled",
  "failed",
] as const;

export type PayRunStatus = (typeof PAY_RUN_STATUS_VALUES)[number];

export interface PayRun extends AggregateRoot {
  readonly environment: PayRunEnvironment;
  readonly status: PayRunStatus;
  readonly creationIdempotencyKey: string;
  readonly supersedesPayRunId?: string;
  readonly intent: PayIntent;
  readonly intentDigest: Digest;
  readonly policyEvaluation?: PolicyEvaluationAttempt;
  readonly policyDecisions: readonly PolicyDecision[];
  readonly approval?: Approval;
  readonly fundingPreparation?: FundingPreparation;
  readonly paymentExecution?: PaymentExecution;
  readonly proofRequest?: ExecutionProofRequest;
  readonly executionProof?: ExecutionProof;
  readonly ledgerDraft?: LedgerDraft;
  readonly ledgerJournal?: LedgerJournal;
  readonly expiry?: ExpiryRecord;
  readonly cancellation?: CancellationRecord;
  readonly failure?: FailureRecord;
  readonly lastAuditSequence: number;
  readonly lastOutboxSequence: number;
}

export interface PayRunTransitionData {
  readonly policyEvaluation?: PolicyEvaluationAttempt;
  readonly policyDecision?: PolicyDecision;
  readonly approval?: Approval;
  readonly fundingPreparation?: FundingPreparation;
  readonly paymentExecution?: PaymentExecution;
  readonly proofRequest?: ExecutionProofRequest;
  readonly executionProof?: ExecutionProof;
  readonly ledgerDraft?: LedgerDraft;
  readonly ledgerJournal?: LedgerJournal;
  readonly expiry?: ExpiryRecord;
  readonly cancellation?: CancellationRecord;
  readonly failure?: FailureRecord;
}

export interface PayRunTransitionCommand {
  readonly to: PayRunStatus;
  readonly expectedVersion: number;
  readonly occurredAt: ISO8601;
  readonly commandType: string;
  readonly idempotencyRecordId: string;
  readonly idempotencyKey: string;
  readonly requestHash: Digest;
  readonly idempotencyRetentionUntil: ISO8601;
  readonly auditEventId: string;
  readonly outboxEventId: string;
  readonly correlationId: string;
  readonly actor: DomainActor;
  readonly reasonCode: string;
  readonly data: PayRunTransitionData;
}

export interface CreatePayRunCommand {
  readonly payRunId: string;
  readonly projectId: ProjectId;
  readonly environment: PayRunEnvironment;
  readonly intent: PayIntent;
  readonly createdAt: ISO8601;
  readonly creationIdempotencyKey: string;
  readonly requestHash: Digest;
  readonly idempotencyRetentionUntil: ISO8601;
  readonly idempotencyRecordId: string;
  readonly auditEventId: string;
  readonly outboxEventId: string;
  readonly correlationId: string;
  readonly actor: DomainActor;
  readonly supersedesPayRunId?: string;
}

export interface PayRunTransitionResult {
  readonly payRun: PayRun;
  readonly idempotencyRecord: IdempotencyRecord;
  readonly auditEvent: AuditEvent;
  readonly outboxEvent: DomainOutboxEvent;
}

export interface ApprovalDecisionCommand {
  readonly expectedVersion: number;
  readonly decision: ApprovalDecision;
  readonly updatedAt: ISO8601;
}

export interface IdempotencyScope {
  readonly projectId: ProjectId;
  readonly commandType: string;
  readonly key: string;
  readonly requestHash: Digest;
  readonly commandAt: ISO8601;
}

export interface PolicyBudgetSnapshot {
  readonly projectRemaining: Money;
  readonly agentRemaining: Money;
  readonly merchantRemaining: Money;
}

export interface PaymentQuote extends ProjectScopedRecord {
  readonly merchantId: string;
  readonly provider: string;
  readonly rail: string;
  readonly amount: Money;
  readonly fee: Money;
  readonly configurationVersion: string;
  readonly quotedAt: ISO8601;
  readonly expiresAt: ISO8601;
}

export interface FundingPreflightQuote extends ProjectScopedRecord {
  readonly planDigest: Digest;
  readonly provider: string;
  readonly source: FundingSource;
  readonly target: LogicalSettlementTarget;
  readonly requestedAmount: Money;
  readonly estimatedFee: Money;
  readonly configurationVersion: string;
  readonly quotedAt: ISO8601;
  readonly expiresAt: ISO8601;
  readonly readOnly: true;
}

export interface PolicyEvaluationRequest {
  readonly decisionId: string;
  readonly projectId: ProjectId;
  readonly payRunId: string;
  readonly payIntentId: string;
  readonly environment: PayRunEnvironment;
  readonly actorScopes: readonly string[];
  readonly project: Project;
  readonly agent: Agent;
  readonly merchant: Merchant;
  readonly intent: PayIntent;
  readonly evaluatedBy: PolicyEvaluator;
  readonly policySnapshot: PolicyEvaluationSnapshot;
  readonly budgetSnapshot: PolicyBudgetSnapshot;
  readonly paymentQuote: PaymentQuote;
  readonly fundingPreflightQuote?: FundingPreflightQuote;
  readonly fundingScopeDigest: Digest;
  readonly settlementTarget: LogicalSettlementTarget;
  readonly rail: string;
  readonly evaluatedAt: ISO8601;
  readonly approval?: Approval;
  readonly recheckContext?: PolicyRecheckContext;
}

export type CompareAndSetResult<T> =
  | { readonly kind: "updated"; readonly value: T }
  | { readonly kind: "conflict" };
