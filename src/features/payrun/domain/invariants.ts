import {
  AuditAppendError,
  EvidenceEnvironmentError,
  IdempotencyConflictError,
  IntentExpiredError,
  InvariantViolationError,
  ProjectScopeError,
} from "./errors";
import { SANDBOX_LEDGER_ACCOUNT_ROLES } from "./types";
import type {
  Approval,
  AuditEvent,
  DomainOutboxEvent,
  EvidenceReference,
  IdempotencyRecord,
  IdempotencyScope,
  LedgerDraft,
  LedgerEntry,
  LedgerJournal,
  Money,
  PayIntent,
  PayRun,
  PayRunEnvironment,
  PolicyDecision,
  ProjectScopedRecord,
  SettlementRef,
} from "./types";

const ATOMIC_AMOUNT_PATTERN = /^(0|[1-9]\d*)$/;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();

  function freeze(current: unknown): void {
    if (current === null || typeof current !== "object" || seen.has(current)) {
      return;
    }
    seen.add(current);
    for (const nested of Object.values(current)) {
      freeze(nested);
    }
    Object.freeze(current);
  }

  freeze(value);
  return value;
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function assertAtomicAmount(value: unknown, field = "amountAtomic"): asserts value is string {
  if (typeof value !== "string" || !ATOMIC_AMOUNT_PATTERN.test(value)) {
    throw new InvariantViolationError(`${field} must be a canonical unsigned decimal string`, {
      field,
      value,
    });
  }
}

export function assertDecimals(value: unknown, field = "decimals"): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 255) {
    throw new InvariantViolationError(`${field} must be an integer from 0 through 255`, {
      field,
      value,
    });
  }
}

export function assertUtcIso(value: unknown, field: string): asserts value is string {
  const canonical =
    typeof value === "string" && !value.includes(".") ? value.replace(/Z$/, ".000Z") : value;
  if (
    typeof value !== "string" ||
    !UTC_ISO_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== canonical
  ) {
    throw new InvariantViolationError(`${field} must be a UTC ISO-8601 timestamp`, {
      field,
      value,
    });
  }
}

function sameLogicalTarget(left: SettlementRef, right: SettlementRef): boolean {
  return (
    left.kind === "logical" &&
    right.kind === "logical" &&
    left.chainFamily === right.chainFamily &&
    left.asset === right.asset &&
    left.decimals === right.decimals
  );
}

function sameMoney(left: Money, right: Money): boolean {
  return (
    left.amountAtomic === right.amountAtomic &&
    left.asset === right.asset &&
    left.decimals === right.decimals &&
    sameLogicalTarget(left.settlementRef, right.settlementRef)
  );
}

function assertEvidenceDomain(
  evidence: EvidenceReference,
  domain: "funding" | "payment" | "proof" | "no_transfer" | "safe_release" | "expiry",
): void {
  const suffix = domain === "proof" ? "execution_proof" : `${domain}_evidence`;
  const expected = evidence.environment === "sandbox" ? `sandbox_${suffix}` : `guarded_${suffix}`;
  if (evidence.kind !== expected) {
    throw new InvariantViolationError(`Evidence kind ${evidence.kind} cannot prove ${domain}`, {
      expected,
      actual: evidence.kind,
    });
  }
}

export function assertSameProject(
  expectedProjectId: string,
  ...records: readonly Pick<ProjectScopedRecord, "projectId">[]
): void {
  for (const record of records) {
    if (record.projectId !== expectedProjectId) {
      throw new ProjectScopeError(expectedProjectId, record.projectId);
    }
  }
}

export function assertIntentCurrent(intent: PayIntent, observedAt: string): void {
  assertUtcIso(intent.createdAt, "intent.createdAt");
  assertUtcIso(intent.expiresAt, "intent.expiresAt");
  assertUtcIso(observedAt, "observedAt");
  if (Date.parse(intent.expiresAt) <= Date.parse(observedAt)) {
    throw new IntentExpiredError(intent.expiresAt, observedAt);
  }
  if (Date.parse(intent.createdAt) >= Date.parse(intent.expiresAt)) {
    throw new InvariantViolationError("Intent expiry must be after creation");
  }
}

function assertSettlementRef(value: SettlementRef): void {
  assertDecimals(value.decimals, "settlementRef.decimals");
  if (value.kind === "logical") {
    if (value.chainFamily !== "base" || value.asset !== "USDC" || value.decimals !== 6) {
      throw new InvariantViolationError("Logical settlement target must be USDC on Base with 6 decimals");
    }
    return;
  }

  if (
    value.environment !== "live_guarded" ||
    !Number.isInteger(value.chainId) ||
    value.chainId <= 0 ||
    value.contractAddress.length === 0 ||
    value.configVersion.length === 0
  ) {
    throw new InvariantViolationError("On-chain asset references require guarded registry identity");
  }
}

export function assertMoney(value: Money): void {
  assertAtomicAmount(value.amountAtomic);
  assertDecimals(value.decimals);
  assertSettlementRef(value.settlementRef);
  if (value.asset.length === 0 || value.asset !== value.settlementRef.asset) {
    throw new InvariantViolationError("Money asset must match its settlement reference");
  }
  if (value.decimals !== value.settlementRef.decimals) {
    throw new InvariantViolationError("Money decimals must match its settlement reference");
  }
}

export function assertEvidenceCompatible(
  environment: PayRunEnvironment,
  evidence: EvidenceReference,
): void {
  if (evidence.environment !== environment) {
    throw new EvidenceEnvironmentError(environment, evidence.environment);
  }
  assertUtcIso(evidence.capturedAt, "evidence.capturedAt");

  if (environment === "sandbox") {
    if (
      !evidence.kind.startsWith("sandbox_") ||
      evidence.synthetic !== true ||
      evidence.transactionHash !== null
    ) {
      throw new EvidenceEnvironmentError("sandbox", evidence.environment);
    }
    return;
  }

  if (evidence.kind.startsWith("sandbox_") || evidence.synthetic) {
    throw new EvidenceEnvironmentError("live_guarded", evidence.environment);
  }
}

function assertAggregateRoot(root: {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}): void {
  if (!root.id || !root.projectId || !Number.isSafeInteger(root.version) || root.version < 1) {
    throw new InvariantViolationError("Aggregate root metadata is invalid", { id: root.id });
  }
  assertUtcIso(root.createdAt, `${root.id}.createdAt`);
  assertUtcIso(root.updatedAt, `${root.id}.updatedAt`);
  if (Date.parse(root.updatedAt) < Date.parse(root.createdAt)) {
    throw new InvariantViolationError("Aggregate updatedAt cannot precede createdAt", { id: root.id });
  }
}

function assertPolicyDecisionConsistency(decision: PolicyDecision): void {
  if (!Number.isSafeInteger(decision.policyVersion) || decision.policyVersion < 1) {
    throw new InvariantViolationError("PolicyDecision version must be a positive safe integer");
  }
  const reasons = new Set<string>();
  decision.checks.forEach((check, index) => {
    if (check.sequence !== index + 1 || reasons.has(check.reasonCode)) {
      throw new InvariantViolationError("Policy checks require monotonic sequence and unique reason codes");
    }
    reasons.add(check.reasonCode);
  });
  const blocks = decision.checks.filter((check) => check.outcome === "block");
  const reviews = decision.checks.filter((check) => check.outcome === "review");
  const outcome = blocks.length ? "blocked" : reviews.length ? "needs_review" : "allowed";
  const reasonCodes = (blocks.length ? blocks : reviews).map((check) => check.reasonCode);
  const nextAction = outcome === "allowed" ? "prepare_funding" : outcome === "needs_review" ? "request_approval" : "stop";
  if (
    decision.outcome !== outcome ||
    decision.nextAction !== nextAction ||
    decision.reasonCodes.length !== reasonCodes.length ||
    decision.reasonCodes.some((reason, index) => reason !== reasonCodes[index])
  ) {
    throw new InvariantViolationError("PolicyDecision outcome, reasons, and next action disagree with checks");
  }
  if (decision.authorizationBasisApprovalDecisionId && outcome !== "allowed") {
    throw new InvariantViolationError("Only an allowed recheck can retain Approval authorization");
  }
  assertUtcIso(decision.evaluatedAt, "policyDecision.evaluatedAt");
  assertUtcIso(decision.validUntil, "policyDecision.validUntil");
  if (Date.parse(decision.validUntil) <= Date.parse(decision.evaluatedAt)) {
    throw new InvariantViolationError("PolicyDecision validity must extend beyond evaluation time");
  }
}

function assertApproval(payRun: PayRun, approval: Approval): void {
  assertAggregateRoot(approval);
  assertSameProject(payRun.projectId, approval, approval.request);
  if (approval.payRunId !== payRun.id || approval.request.payRunId !== payRun.id) {
    throw new InvariantViolationError("Approval must belong to the same PayRun");
  }
  if (approval.request.intentDigest !== payRun.intentDigest) {
    throw new InvariantViolationError("Approval request must bind the immutable intent digest");
  }
  assertMoney(approval.request.amount);
  assertMoney(approval.request.amountCeiling);
  assertUtcIso(approval.request.createdAt, "approval.request.createdAt");
  assertUtcIso(approval.request.expiresAt, "approval.request.expiresAt");
  const reviewDecision = payRun.policyDecisions.find(
    (decision) => decision.id === approval.request.policyDecisionId,
  );
  if (
    approval.request.payIntentId !== payRun.intent.id ||
    approval.request.agentId !== payRun.intent.agentId ||
    approval.request.merchantId !== payRun.intent.merchant.merchantId ||
    approval.request.purpose !== payRun.intent.purpose ||
    !sameMoney(approval.request.amount, payRun.intent.quotedAmount) ||
    !sameMoney(approval.request.amountCeiling, payRun.intent.maximumAmount) ||
    !sameLogicalTarget(approval.request.settlementTarget, payRun.intent.settlementTarget) ||
    !reviewDecision ||
    reviewDecision.outcome !== "needs_review" ||
    reviewDecision.policyId !== approval.request.policyId ||
    reviewDecision.policyVersion !== approval.request.policyVersion ||
    reviewDecision.policyChecksum !== approval.request.policyChecksum ||
    reviewDecision.inputSnapshotDigest !== approval.request.policyEvaluationDigest
  ) {
    throw new InvariantViolationError("ApprovalRequest does not bind the canonical review scope");
  }
  if (
    approval.request.coveredReasonCodes.length !== reviewDecision.reasonCodes.length ||
    approval.request.coveredReasonCodes.some(
      (reason, index) => reason !== reviewDecision.reasonCodes[index],
    )
  ) {
    throw new InvariantViolationError("Approval covered reasons must exactly match the reviewed decision");
  }

  if (approval.status === "pending") {
    if (approval.decision) {
      throw new InvariantViolationError("Pending Approval cannot contain a final decision");
    }
    return;
  }

  if (approval.status === "expired") {
    if (approval.decision) {
      throw new InvariantViolationError("Expired Approval cannot contain an approve/deny decision");
    }
    return;
  }

  if (!approval.decision) {
    throw new InvariantViolationError("Terminal Approval must contain one immutable decision");
  }
  assertSameProject(payRun.projectId, approval.decision);
  if (
    approval.decision.approvalId !== approval.id ||
    approval.decision.payRunId !== payRun.id ||
    approval.decision.outcome !== approval.status ||
    approval.decision.approvalScopeDigest !== approval.request.approvalScopeDigest
  ) {
    throw new InvariantViolationError("Approval decision does not match its request and scope");
  }
  if (
    approval.decision.reviewerId !== approval.decision.approver.actorId ||
    approval.decision.approver.actorType !== "user" ||
    approval.decision.approver.actorId === approval.request.requester.actorId
  ) {
    throw new InvariantViolationError("Approval requires a distinct authenticated human approver");
  }
}

function assertLineage(payRun: PayRun, artifact: { projectId: string; payRunId: string }): void {
  assertSameProject(payRun.projectId, artifact);
  if (artifact.payRunId !== payRun.id) {
    throw new InvariantViolationError("Stage artifact belongs to a different PayRun", {
      expectedPayRunId: payRun.id,
      actualPayRunId: artifact.payRunId,
    });
  }
}

function assertNoDownstream(
  payRun: PayRun,
  from: "funding" | "payment" | "proof" | "ledger",
): void {
  const forbidden =
    from === "funding"
      ? [
          payRun.fundingPreparation,
          payRun.paymentExecution,
          payRun.proofRequest,
          payRun.executionProof,
          payRun.ledgerDraft,
          payRun.ledgerJournal,
        ]
      : from === "payment"
        ? [
            payRun.paymentExecution,
            payRun.proofRequest,
            payRun.executionProof,
            payRun.ledgerDraft,
            payRun.ledgerJournal,
          ]
        : from === "proof"
          ? [payRun.proofRequest, payRun.executionProof, payRun.ledgerDraft, payRun.ledgerJournal]
          : [payRun.ledgerDraft, payRun.ledgerJournal];
  if (forbidden.some((value) => value !== undefined)) {
    throw new InvariantViolationError(`PayRun contains forbidden artifacts at the ${from} boundary`);
  }
}

function latestDecision(payRun: PayRun) {
  return payRun.policyDecisions.at(-1);
}

function assertAllowedDecision(payRun: PayRun): void {
  const decision = latestDecision(payRun);
  if (!decision || decision.outcome !== "allowed") {
    throw new InvariantViolationError("Current PolicyDecision must be allowed");
  }
  assertLineage(payRun, decision);
  if (Date.parse(decision.validUntil) <= Date.parse(payRun.updatedAt)) {
    throw new InvariantViolationError("Allowed PolicyDecision is stale or expired");
  }
  if (payRun.approval?.status === "approved") {
    if (decision.authorizationBasisApprovalDecisionId !== payRun.approval.decision?.id) {
      throw new InvariantViolationError("Approval-backed Policy recheck must record its authorization basis");
    }
  }
}

function assertFunding(payRun: PayRun, accepted: boolean): void {
  const funding = payRun.fundingPreparation;
  if (!funding) {
    throw new InvariantViolationError("FundingPreparation is required");
  }
  assertAggregateRoot(funding);
  assertLineage(payRun, funding);
  assertMoney(funding.requestedAmount);
  assertUtcIso(funding.expiresAt, "funding.expiresAt");
  if (funding.requiredTarget.asset !== "USDC" || funding.requiredTarget.chainFamily !== "base") {
    throw new InvariantViolationError("Policy-resolved Funding target must remain USDC on Base");
  }
  assertAtomicAmount(funding.source.amountAtomic, "funding.source.amountAtomic");
  assertDecimals(funding.source.decimals, "funding.source.decimals");

  const decision = latestDecision(payRun);
  if (
    funding.intentDigest !== payRun.intentDigest ||
    funding.policyDecisionId !== decision?.id ||
    !sameMoney(funding.requestedAmount, payRun.intent.quotedAmount) ||
    !sameLogicalTarget(funding.requiredTarget, payRun.intent.settlementTarget) ||
    (payRun.approval?.status === "approved" &&
      funding.approvedScopeDigest !== payRun.approval.request.fundingScopeDigest)
  ) {
    throw new InvariantViolationError("FundingPreparation does not match the authorized scope");
  }

  const attemptIds = new Set<string>();
  for (const attempt of funding.attempts ?? []) {
    assertLineage(payRun, attempt);
    if (
      attemptIds.has(attempt.id) ||
      attempt.fundingPreparationId !== funding.id ||
      attempt.planDigest !== funding.planDigest ||
      !attempt.executionKey
    ) {
      throw new InvariantViolationError("FundingAttempt must retain one plan and execution identity");
    }
    attemptIds.add(attempt.id);
    if (attempt.evidence) assertEvidenceCompatible(payRun.environment, attempt.evidence);
  }

  if (funding.evidence) {
    assertEvidenceCompatible(payRun.environment, funding.evidence);
    if (["not_required", "sandbox_prepared", "prepared"].includes(funding.status)) {
      assertEvidenceDomain(funding.evidence, "funding");
    }
  }

  if (payRun.environment === "sandbox") {
    if (
      funding.transactionHash !== null ||
      funding.realFundsAvailable ||
      funding.realBridgeCapability
    ) {
      throw new InvariantViolationError("Sandbox Funding cannot claim real funds, bridge, or transaction hash");
    }
    if (funding.route.some((step) => !step.simulated)) {
      throw new InvariantViolationError("Every Sandbox Funding route step must be simulated");
    }
  }

  if (!accepted) {
    if (!["requested", "planned"].includes(funding.status)) {
      throw new InvariantViolationError("Funding preparation state requires requested or planned status");
    }
    return;
  }

  if (!["not_required", "sandbox_prepared", "prepared"].includes(funding.status)) {
    throw new InvariantViolationError("Payment requires an accepted FundingPreparation result");
  }
  if (!funding.evidence) {
    throw new InvariantViolationError("Accepted FundingPreparation requires verifiable evidence");
  }
  if ((funding.attempts ?? []).length === 0) {
    throw new InvariantViolationError("Accepted FundingPreparation requires an append-only attempt");
  }
  if (payRun.environment === "sandbox" && funding.status === "prepared") {
    throw new InvariantViolationError("Sandbox Funding must not use the guarded prepared status");
  }
  if (Date.parse(funding.expiresAt) <= Date.parse(payRun.updatedAt)) {
    throw new InvariantViolationError("Funding evidence expired before Payment");
  }
}

function assertPayment(payRun: PayRun, expected: "executing" | "unknown" | "succeeded"): void {
  assertFunding(payRun, true);
  const payment = payRun.paymentExecution;
  if (!payment) {
    throw new InvariantViolationError("PaymentExecution is required");
  }
  assertAggregateRoot(payment);
  assertLineage(payRun, payment);
  assertLineage(payRun, payment.instruction);
  assertMoney(payment.instruction.amount);
  if (
    payment.instruction.instructionHash.length === 0 ||
    payment.instruction.executionKey.length === 0 ||
    payment.instruction.target.asset !== "USDC" ||
    payment.instruction.target.chainFamily !== "base"
  ) {
    throw new InvariantViolationError("PaymentInstruction is not bound to a deterministic USDC/Base execution");
  }
  if (
    payment.instruction.fundingPreparationId !== payRun.fundingPreparation?.id ||
    payment.instruction.merchantId !== payRun.intent.merchant.merchantId ||
    !sameMoney(payment.instruction.amount, payRun.intent.quotedAmount) ||
    !sameMoney(payment.instruction.amount, payRun.fundingPreparation!.requestedAmount) ||
    !sameLogicalTarget(payment.instruction.target, payRun.intent.settlementTarget)
  ) {
    throw new InvariantViolationError("PaymentInstruction does not match Intent and Funding scope");
  }
  if (payment.attempts.length === 0) {
    throw new InvariantViolationError("PaymentExecution requires a prepared append-only attempt");
  }
  const attemptIds = new Set<string>();
  for (const attempt of payment.attempts) {
    assertLineage(payRun, attempt);
    if (
      attemptIds.has(attempt.id) ||
      attempt.paymentExecutionId !== payment.id ||
      attempt.executionKey !== payment.instruction.executionKey ||
      attempt.instructionHash !== payment.instruction.instructionHash
    ) {
      throw new InvariantViolationError("ExecutionAttempt must retain logical payment identity");
    }
    attemptIds.add(attempt.id);
  }

  const lastAttempt = payment.attempts.at(-1)!;

  if (expected === "executing" && !["prepared", "submitted"].includes(payment.status)) {
    throw new InvariantViolationError("payment_executing requires a prepared or submitted PaymentExecution");
  }
  if (expected === "unknown" && payment.status !== "unknown") {
    throw new InvariantViolationError("payment_unknown requires an unknown PaymentExecution outcome");
  }
  if (
    expected === "unknown" &&
    (lastAttempt.outcome !== "unknown" || !["scheduled", "reconciling"].includes(payment.reconciliationState))
  ) {
    throw new InvariantViolationError("Unknown Payment requires reconciliation and an unknown attempt");
  }
  if (expected === "succeeded") {
    if (
      payment.status !== "succeeded" ||
      !payment.evidence ||
      !payment.providerReference ||
      lastAttempt.outcome !== "final_success"
    ) {
      throw new InvariantViolationError("payment_succeeded requires authoritative Payment evidence");
    }
    assertEvidenceCompatible(payRun.environment, payment.evidence);
    assertEvidenceDomain(payment.evidence, "payment");
  }
}

function assertProof(payRun: PayRun, collected: boolean): void {
  assertPayment(payRun, "succeeded");
  if (!payRun.proofRequest) {
    throw new InvariantViolationError("ExecutionProof request is required after Payment success");
  }
  assertLineage(payRun, payRun.proofRequest);
  if (payRun.proofRequest.paymentExecutionId !== payRun.paymentExecution?.id) {
    throw new InvariantViolationError("Proof request must bind the successful PaymentExecution");
  }
  if (!collected) {
    if (payRun.executionProof) {
      throw new InvariantViolationError("proof_collecting cannot contain collected proof");
    }
    return;
  }
  if (!payRun.executionProof || payRun.executionProof.verificationStatus !== "verified") {
    throw new InvariantViolationError("proof_collected requires a verified ExecutionProof");
  }
  assertLineage(payRun, payRun.executionProof);
  if (
    payRun.executionProof.paymentExecutionId !== payRun.paymentExecution?.id ||
    payRun.executionProof.requestId !== payRun.proofRequest.id
  ) {
    throw new InvariantViolationError("ExecutionProof must bind its Payment and request");
  }
  assertEvidenceCompatible(payRun.environment, payRun.executionProof.evidence);
  assertEvidenceDomain(payRun.executionProof.evidence, "proof");
  if (
    payRun.executionProof.artifactType !== payRun.intent.expectedArtifactType ||
    payRun.proofRequest.artifactType !== payRun.intent.expectedArtifactType
  ) {
    throw new InvariantViolationError("ExecutionProof artifact type must match the immutable intent");
  }
}

function entryTotals(entries: readonly LedgerEntry[]): { debit: bigint; credit: bigint } {
  let debit = 0n;
  let credit = 0n;
  for (const entry of entries) {
    assertAtomicAmount(entry.debitAtomic, "ledgerEntry.debitAtomic");
    assertAtomicAmount(entry.creditAtomic, "ledgerEntry.creditAtomic");
    const debitValue = BigInt(entry.debitAtomic);
    const creditValue = BigInt(entry.creditAtomic);
    if ((debitValue === 0n) === (creditValue === 0n)) {
      throw new InvariantViolationError("LedgerEntry must contain exactly one non-zero side");
    }
    debit += debitValue;
    credit += creditValue;
  }
  return { debit, credit };
}

export function assertLedgerBalanced(journal: LedgerJournal | LedgerDraft): void {
  if (journal.entries.length < 2) {
    throw new InvariantViolationError("Ledger journal requires at least two entries");
  }
  for (const entry of journal.entries) {
    assertSameProject(journal.projectId, entry);
    if ("version" in journal && entry.journalId !== journal.id) {
      throw new InvariantViolationError("LedgerEntry must bind the committed Journal ID");
    }
    if (journal.environment === "sandbox") {
      const expectedAccountId = `sandbox:${journal.projectId}:${entry.accountRole}`;
      if (
        !(SANDBOX_LEDGER_ACCOUNT_ROLES as readonly string[]).includes(entry.accountRole) ||
        entry.accountId !== expectedAccountId
      ) {
        throw new InvariantViolationError("Sandbox Ledger must use the accepted project-scoped simulated account roles");
      }
    }
  }
  const totals = entryTotals(journal.entries);
  if (totals.debit !== totals.credit) {
    throw new InvariantViolationError("Ledger debits and credits must balance exactly", {
      debit: totals.debit.toString(),
      credit: totals.credit.toString(),
    });
  }
}

export function assertJournalUnique(
  existing: readonly LedgerJournal[],
  next: LedgerJournal,
): void {
  if (
    existing.some(
      (journal) =>
        journal.projectId === next.projectId &&
        (journal.executionProofId === next.executionProofId ||
          journal.externalReference === next.externalReference),
    )
  ) {
    throw new InvariantViolationError("Verified proof or external reference is already posted");
  }
}

function assertLedgerForPayRun(payRun: PayRun, committed: boolean): void {
  assertProof(payRun, true);
  if (committed) {
    const journal = payRun.ledgerJournal;
    if (!journal) {
      throw new InvariantViolationError("completed requires a committed LedgerJournal");
    }
    assertAggregateRoot(journal);
    assertLineage(payRun, journal);
    if (
      journal.paymentExecutionId !== payRun.paymentExecution?.id ||
      journal.executionProofId !== payRun.executionProof?.id ||
      journal.environment !== payRun.environment
    ) {
      throw new InvariantViolationError("LedgerJournal must bind Payment, Proof, and environment");
    }
    if (
      journal.externalReference !== payRun.paymentExecution?.providerReference ||
      journal.evidenceHash !== payRun.executionProof?.checksum ||
      !sameLogicalTarget(journal.assetRef, payRun.intent.settlementTarget)
    ) {
      throw new InvariantViolationError("LedgerJournal evidence must bind the Payment and ExecutionProof");
    }
    assertLedgerBalanced(journal);
    const totals = entryTotals(journal.entries);
    if (totals.debit !== BigInt(payRun.paymentExecution!.instruction.amount.amountAtomic)) {
      throw new InvariantViolationError("Ledger value must equal the exact PaymentInstruction amount");
    }
    return;
  }

  if (!payRun.ledgerDraft) {
    throw new InvariantViolationError("ledger_recording requires a prepared Ledger draft");
  }
  assertLineage(payRun, payRun.ledgerDraft);
  if (
    payRun.ledgerDraft.paymentExecutionId !== payRun.paymentExecution?.id ||
    payRun.ledgerDraft.executionProofId !== payRun.executionProof?.id ||
    payRun.ledgerDraft.environment !== payRun.environment
  ) {
    throw new InvariantViolationError("Ledger draft must bind Payment, Proof, and environment");
  }
  assertLedgerBalanced(payRun.ledgerDraft);
}

export function assertPayRunInvariants(payRun: PayRun): void {
  assertAggregateRoot(payRun);
  assertSameProject(payRun.projectId, payRun.intent);
  if (payRun.intent.payRunId !== payRun.id || payRun.intent.digest !== payRun.intentDigest) {
    throw new InvariantViolationError("PayIntent must bind the PayRun and immutable digest");
  }
  assertMoney(payRun.intent.maximumAmount);
  assertMoney(payRun.intent.quotedAmount);
  if (
    !Number.isInteger(payRun.lastAuditSequence) ||
    !Number.isInteger(payRun.lastOutboxSequence) ||
    payRun.lastAuditSequence < 0 ||
    payRun.lastOutboxSequence < 0
  ) {
    throw new InvariantViolationError("Audit and Outbox sequences must be non-negative integers");
  }

  for (const decision of payRun.policyDecisions) {
    assertLineage(payRun, decision);
    assertPolicyDecisionConsistency(decision);
  }
  if (payRun.policyEvaluation) assertLineage(payRun, payRun.policyEvaluation);
  if (payRun.approval) assertApproval(payRun, payRun.approval);
  if (payRun.fundingPreparation) assertLineage(payRun, payRun.fundingPreparation);
  if (payRun.paymentExecution) assertLineage(payRun, payRun.paymentExecution);
  if (payRun.proofRequest) assertLineage(payRun, payRun.proofRequest);
  if (payRun.executionProof) assertLineage(payRun, payRun.executionProof);
  if (payRun.ledgerDraft) assertLineage(payRun, payRun.ledgerDraft);
  if (payRun.ledgerJournal) assertLineage(payRun, payRun.ledgerJournal);
  if (payRun.cancellation) assertLineage(payRun, payRun.cancellation);

  switch (payRun.status) {
    case "intent_recorded":
      if (payRun.policyEvaluation || payRun.policyDecisions.length > 0 || payRun.approval) {
        throw new InvariantViolationError("intent_recorded cannot contain Policy or Approval results");
      }
      assertNoDownstream(payRun, "funding");
      break;
    case "policy_evaluating":
      if (!payRun.policyEvaluation) {
        throw new InvariantViolationError("policy_evaluating requires evaluation attempt metadata");
      }
      assertNoDownstream(payRun, "funding");
      break;
    case "policy_allowed":
      assertAllowedDecision(payRun);
      assertNoDownstream(payRun, "funding");
      break;
    case "pending_review": {
      const decision = latestDecision(payRun);
      if (decision?.outcome !== "needs_review" || payRun.approval?.status !== "pending") {
        throw new InvariantViolationError("pending_review requires needs_review and pending Approval");
      }
      assertIntentCurrent(payRun.intent, payRun.updatedAt);
      if (Date.parse(payRun.approval.request.expiresAt) <= Date.parse(payRun.updatedAt)) {
        throw new IntentExpiredError(payRun.approval.request.expiresAt, payRun.updatedAt);
      }
      assertNoDownstream(payRun, "funding");
      break;
    }
    case "approved":
      if (payRun.approval?.status !== "approved") {
        throw new InvariantViolationError("approved requires one final human ApprovalDecision");
      }
      assertNoDownstream(payRun, "funding");
      break;
    case "funding_preparing":
      assertAllowedDecision(payRun);
      assertFunding(payRun, false);
      assertNoDownstream(payRun, "payment");
      break;
    case "funding_prepared":
      assertAllowedDecision(payRun);
      assertFunding(payRun, true);
      assertNoDownstream(payRun, "payment");
      break;
    case "payment_executing":
      assertAllowedDecision(payRun);
      assertPayment(payRun, "executing");
      assertNoDownstream(payRun, "proof");
      break;
    case "payment_unknown":
      assertAllowedDecision(payRun);
      assertPayment(payRun, "unknown");
      assertNoDownstream(payRun, "proof");
      break;
    case "payment_succeeded":
      assertAllowedDecision(payRun);
      assertPayment(payRun, "succeeded");
      assertNoDownstream(payRun, "proof");
      break;
    case "proof_collecting":
      assertAllowedDecision(payRun);
      assertProof(payRun, false);
      assertNoDownstream(payRun, "ledger");
      break;
    case "proof_collected":
      assertAllowedDecision(payRun);
      assertProof(payRun, true);
      assertNoDownstream(payRun, "ledger");
      break;
    case "ledger_recording":
      assertAllowedDecision(payRun);
      assertLedgerForPayRun(payRun, false);
      if (payRun.ledgerJournal) {
        throw new InvariantViolationError("LedgerJournal is committed only with completed transition");
      }
      break;
    case "completed":
      assertAllowedDecision(payRun);
      assertLedgerForPayRun(payRun, true);
      if (payRun.lastAuditSequence < 1 || payRun.lastOutboxSequence < 1) {
        throw new InvariantViolationError("completed requires Audit and Domain Outbox evidence");
      }
      break;
    case "blocked": {
      const decision = latestDecision(payRun);
      if (decision?.outcome !== "blocked" || decision.reasonCodes.length === 0) {
        throw new InvariantViolationError("blocked requires a PolicyDecision and stable reasons");
      }
      if (payRun.approval && payRun.approval.status !== "approved") {
        throw new InvariantViolationError("blocked may retain only historical approved evidence");
      }
      assertNoDownstream(payRun, "funding");
      break;
    }
    case "denied":
      if (payRun.approval?.status !== "denied") {
        throw new InvariantViolationError("denied requires human rejection evidence");
      }
      assertNoDownstream(payRun, "funding");
      break;
    case "expired":
      if (!payRun.expiry || !payRun.expiry.reasonCode) {
        throw new InvariantViolationError("expired requires stage, reason, and expiry evidence");
      }
      assertEvidenceCompatible(payRun.environment, payRun.expiry.evidence);
      assertEvidenceDomain(payRun.expiry.evidence, "expiry");
      if (payRun.expiry.externalEffectPossible && !payRun.expiry.safeReleaseEvidence) {
        throw new InvariantViolationError("Expiry after possible effect requires safe-release evidence");
      }
      if (payRun.expiry.safeReleaseEvidence) {
        assertEvidenceCompatible(payRun.environment, payRun.expiry.safeReleaseEvidence);
        assertEvidenceDomain(payRun.expiry.safeReleaseEvidence, "safe_release");
      }
      if (
        !["funding_preparing", "funding_prepared"].includes(payRun.expiry.expiredAtStage) &&
        payRun.fundingPreparation
      ) {
        throw new InvariantViolationError("Intent/Approval/Policy expiry cannot retain Funding");
      }
      if (payRun.paymentExecution || payRun.proofRequest || payRun.executionProof || payRun.ledgerJournal) {
        throw new InvariantViolationError("Expired PayRun cannot contain Payment, Proof, or Ledger");
      }
      break;
    case "cancellation_pending":
    case "cancelled":
      if (!payRun.cancellation || payRun.cancellation.status !== (payRun.status === "cancelled" ? "cancelled" : "pending")) {
        throw new InvariantViolationError("Cancellation state requires matching cancellation evidence");
      }
      if (payRun.cancellation.externalEffectPossible && !payRun.cancellation.safeReleaseEvidence) {
        throw new InvariantViolationError("Cancellation after possible effect requires safe-release evidence");
      }
      if (payRun.cancellation.safeReleaseEvidence) {
        assertEvidenceCompatible(payRun.environment, payRun.cancellation.safeReleaseEvidence);
        assertEvidenceDomain(payRun.cancellation.safeReleaseEvidence, "safe_release");
      }
      if (payRun.paymentExecution || payRun.proofRequest || payRun.executionProof || payRun.ledgerJournal) {
        throw new InvariantViolationError("Pre-effect cancellation cannot contain Payment, Proof, or Ledger");
      }
      break;
    case "failed":
      if (!payRun.failure || !payRun.failure.reasonCode) {
        throw new InvariantViolationError("failed requires authoritative stage failure evidence");
      }
      if (payRun.failure.externalEffectAttempted && !payRun.failure.noValueMovedEvidence) {
        throw new InvariantViolationError("External failure requires authoritative no-transfer evidence");
      }
      if (payRun.failure.noValueMovedEvidence) {
        assertEvidenceCompatible(payRun.environment, payRun.failure.noValueMovedEvidence);
        assertEvidenceDomain(payRun.failure.noValueMovedEvidence, "no_transfer");
      }
      if (payRun.paymentExecution && payRun.paymentExecution.status !== "failed_no_transfer") {
        throw new InvariantViolationError("Failed PaymentExecution must prove no transfer");
      }
      if (payRun.proofRequest || payRun.executionProof || payRun.ledgerDraft || payRun.ledgerJournal) {
        throw new InvariantViolationError("Authoritative no-transfer failure cannot contain Proof or Ledger");
      }
      break;
  }
}

export function appendAuditEvent(
  existing: readonly AuditEvent[],
  next: AuditEvent,
): readonly AuditEvent[] {
  const previous = existing.at(-1);
  const expectedSequence = (previous?.sequence ?? 0) + 1;
  if (existing.some((event) => event.id === next.id)) {
    throw new AuditAppendError("Audit event identity must be unique");
  }
  if (next.sequence !== expectedSequence) {
    throw new AuditAppendError("Audit sequence must append monotonically", {
      expectedSequence,
      actualSequence: next.sequence,
    });
  }
  if (previous) {
    assertSameProject(previous.projectId, next);
    if (
      previous.aggregateId !== next.aggregateId ||
      previous.afterVersion !== next.beforeVersion ||
      next.afterVersion !== next.beforeVersion + 1
    ) {
      throw new AuditAppendError("Audit event does not continue aggregate version history");
    }
  } else if (next.beforeVersion !== 0 || next.afterVersion !== 1) {
    throw new AuditAppendError("First Audit event must record aggregate creation");
  }
  return cloneAndFreeze([...existing, next]);
}

export function appendDomainOutboxEvent(
  existing: readonly DomainOutboxEvent[],
  next: DomainOutboxEvent,
): readonly DomainOutboxEvent[] {
  const previous = existing.at(-1);
  const expectedSequence = (previous?.sequence ?? 0) + 1;
  if (existing.some((event) => event.id === next.id)) {
    throw new AuditAppendError("Domain Outbox event identity must be unique");
  }
  if (
    next.payload.payRunId !== next.aggregateId ||
    next.payload.afterVersion !== next.aggregateVersion
  ) {
    throw new AuditAppendError("Domain Outbox payload must match aggregate identity and version");
  }
  if (next.sequence !== expectedSequence) {
    throw new AuditAppendError("Domain Outbox sequence must append monotonically", {
      expectedSequence,
      actualSequence: next.sequence,
    });
  }
  if (previous) {
    assertSameProject(previous.projectId, next);
    if (
      previous.aggregateId !== next.aggregateId ||
      next.aggregateVersion !== previous.aggregateVersion + 1
    ) {
      throw new AuditAppendError("Domain Outbox event does not continue aggregate history");
    }
  } else if (next.aggregateVersion !== 1) {
    throw new AuditAppendError("First Domain Outbox event must record aggregate version 1");
  }
  return cloneAndFreeze([...existing, next]);
}

export function resolveIdempotency(
  existing: IdempotencyRecord | null,
  scope: IdempotencyScope,
):
  | { readonly kind: "new" }
  | { readonly kind: "replay"; readonly record: IdempotencyRecord } {
  if (!existing) return cloneAndFreeze({ kind: "new" as const });
  assertUtcIso(scope.commandAt, "idempotency.commandAt");
  assertUtcIso(existing.retentionUntil, "idempotency.retentionUntil");
  if (Date.parse(existing.retentionUntil) <= Date.parse(scope.commandAt)) {
    throw new InvariantViolationError("Idempotency retention must extend beyond command time");
  }
  if (existing.projectId !== scope.projectId) {
    throw new ProjectScopeError(scope.projectId, existing.projectId);
  }
  if (existing.commandType !== scope.commandType || existing.key !== scope.key) {
    return cloneAndFreeze({ kind: "new" as const });
  }
  if (existing.requestHash !== scope.requestHash) {
    throw new IdempotencyConflictError(scope.commandType, scope.key);
  }
  return cloneAndFreeze({ kind: "replay" as const, record: existing });
}
