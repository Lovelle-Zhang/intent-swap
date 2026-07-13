import {
  ApprovalConflictError,
  IntentExpiredError,
  InvalidTransitionError,
  InvariantViolationError,
  ProjectScopeError,
  TerminalStateError,
  VersionConflictError,
} from "./errors";
import {
  assertIntentCurrent,
  assertPayRunInvariants,
  assertSameProject,
  assertUtcIso,
  deepFreeze,
} from "./invariants";
import {
  PAY_RUN_STATUS_VALUES,
  type Approval,
  type ApprovalDecisionCommand,
  type AuditEvent,
  type CreatePayRunCommand,
  type DomainOutboxEvent,
  type IdempotencyRecord,
  type FundingPreparation,
  type PaymentExecution,
  type PayRun,
  type PayRunStatus,
  type PayRunTransitionCommand,
  type PayRunTransitionData,
  type PayRunTransitionResult,
} from "./types";

export const PAY_RUN_STATUSES = PAY_RUN_STATUS_VALUES;

export const LEGAL_TRANSITIONS: Readonly<Record<PayRunStatus, readonly PayRunStatus[]>> = deepFreeze({
  intent_recorded: ["policy_evaluating", "cancellation_pending"],
  policy_evaluating: [
    "policy_evaluating",
    "policy_allowed",
    "pending_review",
    "blocked",
    "failed",
    "expired",
    "cancellation_pending",
  ],
  policy_allowed: ["policy_evaluating", "funding_preparing", "expired", "cancellation_pending"],
  pending_review: ["approved", "denied", "expired", "cancellation_pending"],
  approved: ["policy_evaluating", "expired", "cancellation_pending"],
  funding_preparing: [
    "funding_preparing",
    "funding_prepared",
    "failed",
    "expired",
    "cancellation_pending",
  ],
  funding_prepared: ["payment_executing", "expired", "failed", "cancellation_pending"],
  payment_executing: ["payment_succeeded", "payment_unknown", "failed"],
  payment_unknown: ["payment_unknown", "payment_succeeded", "failed"],
  payment_succeeded: ["proof_collecting"],
  proof_collecting: ["proof_collecting", "proof_collected"],
  proof_collected: ["ledger_recording"],
  ledger_recording: ["ledger_recording", "completed"],
  completed: [],
  blocked: [],
  denied: [],
  expired: [],
  cancellation_pending: ["cancellation_pending", "cancelled"],
  cancelled: [],
  failed: [],
});

export const TERMINAL_PAY_RUN_STATUSES = deepFreeze([
  "completed",
  "blocked",
  "denied",
  "expired",
  "cancelled",
  "failed",
] as const satisfies readonly PayRunStatus[]);

const DATA_KEYS = [
  "policyEvaluation",
  "policyDecision",
  "approval",
  "fundingPreparation",
  "paymentExecution",
  "proofRequest",
  "executionProof",
  "ledgerDraft",
  "ledgerJournal",
  "expiry",
  "cancellation",
  "failure",
] as const satisfies readonly (keyof PayRunTransitionData)[];

const ALLOWED_DATA_KEYS: Readonly<Record<PayRunStatus, readonly (keyof PayRunTransitionData)[]>> = {
  intent_recorded: [],
  policy_evaluating: ["policyEvaluation"],
  policy_allowed: ["policyDecision"],
  pending_review: ["policyDecision", "approval"],
  approved: ["approval"],
  funding_preparing: ["fundingPreparation"],
  funding_prepared: ["fundingPreparation"],
  payment_executing: ["paymentExecution"],
  payment_unknown: ["paymentExecution"],
  payment_succeeded: ["paymentExecution"],
  proof_collecting: ["proofRequest"],
  proof_collected: ["executionProof"],
  ledger_recording: ["ledgerDraft"],
  completed: ["ledgerJournal"],
  blocked: ["policyDecision"],
  denied: ["approval"],
  expired: ["expiry"],
  cancellation_pending: ["cancellation"],
  cancelled: ["cancellation"],
  failed: ["failure", "fundingPreparation", "paymentExecution"],
};

export function canTransition(from: PayRunStatus, to: PayRunStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

interface TransitionRecordInput {
  readonly payRun: PayRun;
  readonly beforeVersion: number;
  readonly beforeStatus: PayRunStatus | null;
  readonly occurredAt: string;
  readonly commandType: string;
  readonly idempotencyRecordId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly idempotencyRetentionUntil: string;
  readonly auditEventId: string;
  readonly outboxEventId: string;
  readonly correlationId: string;
  readonly actor: AuditEvent["actor"];
  readonly reasonCode: string;
  readonly responseStatus: number;
}

function buildTransitionResult(input: TransitionRecordInput): PayRunTransitionResult {
  const sequence = input.payRun.lastAuditSequence;
  const auditEvent: AuditEvent = {
    id: input.auditEventId,
    projectId: input.payRun.projectId,
    payRunId: input.payRun.id,
    aggregateType: "PayRun",
    aggregateId: input.payRun.id,
    sequence,
    beforeVersion: input.beforeVersion,
    afterVersion: input.payRun.version,
    actor: input.actor,
    actionCode: input.beforeStatus === null ? "payrun.created" : "payrun.transition",
    reasonCode: input.reasonCode,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    details: {
      fromStatus: input.beforeStatus,
      toStatus: input.payRun.status,
      environment: input.payRun.environment,
    },
  };
  const outboxEvent: DomainOutboxEvent = {
    id: input.outboxEventId,
    projectId: input.payRun.projectId,
    aggregateType: "PayRun",
    aggregateId: input.payRun.id,
    aggregateVersion: input.payRun.version,
    sequence: input.payRun.lastOutboxSequence,
    eventType: input.beforeStatus === null ? "payrun.created" : "payrun.transitioned",
    schemaVersion: 1,
    payload: {
      payRunId: input.payRun.id,
      fromStatus: input.beforeStatus,
      toStatus: input.payRun.status,
      beforeVersion: input.beforeVersion,
      afterVersion: input.payRun.version,
      environment: input.payRun.environment,
      reasonCode: input.reasonCode,
    },
    occurredAt: input.occurredAt,
  };
  const idempotencyRecord: IdempotencyRecord = {
    id: input.idempotencyRecordId,
    projectId: input.payRun.projectId,
    version: 1,
    commandType: input.commandType,
    key: input.idempotencyKey,
    requestHash: input.requestHash,
    state: "completed",
    resultResourceId: input.payRun.id,
    resultVersion: input.payRun.version,
    responseStatus: input.responseStatus,
    retentionUntil: input.idempotencyRetentionUntil,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };

  return deepFreeze(structuredClone({
    payRun: input.payRun,
    idempotencyRecord,
    auditEvent,
    outboxEvent,
  }));
}

export function createPayRun(command: CreatePayRunCommand): PayRunTransitionResult {
  assertUtcIso(command.createdAt, "createPayRun.createdAt");
  assertUtcIso(command.idempotencyRetentionUntil, "createPayRun.idempotencyRetentionUntil");
  if (Date.parse(command.idempotencyRetentionUntil) <= Date.parse(command.createdAt)) {
    throw new InvariantViolationError("Idempotency retention must extend beyond command time");
  }
  if (command.projectId !== command.intent.projectId) {
    throw new ProjectScopeError(command.projectId, command.intent.projectId);
  }
  if (command.payRunId !== command.intent.payRunId) {
    throw new InvariantViolationError("PayIntent must be created for the same PayRun ID");
  }
  if (!command.payRunId || !command.creationIdempotencyKey || !command.requestHash) {
    throw new InvariantViolationError("PayRun creation identifiers and request hash are required");
  }
  assertIntentCurrent(command.intent, command.createdAt);

  const payRun: PayRun = {
    id: command.payRunId,
    projectId: command.projectId,
    version: 1,
    environment: command.environment,
    status: "intent_recorded",
    creationIdempotencyKey: command.creationIdempotencyKey,
    ...(command.supersedesPayRunId ? { supersedesPayRunId: command.supersedesPayRunId } : {}),
    intent: command.intent,
    intentDigest: command.intent.digest,
    policyDecisions: [],
    lastAuditSequence: 1,
    lastOutboxSequence: 1,
    createdAt: command.createdAt,
    updatedAt: command.createdAt,
  };
  assertPayRunInvariants(payRun);
  const frozenPayRun = deepFreeze(structuredClone(payRun));

  return buildTransitionResult({
    payRun: frozenPayRun,
    beforeVersion: 0,
    beforeStatus: null,
    occurredAt: command.createdAt,
    commandType: "create_payrun",
    idempotencyRecordId: command.idempotencyRecordId,
    idempotencyKey: command.creationIdempotencyKey,
    requestHash: command.requestHash,
    idempotencyRetentionUntil: command.idempotencyRetentionUntil,
    auditEventId: command.auditEventId,
    outboxEventId: command.outboxEventId,
    correlationId: command.correlationId,
    actor: command.actor,
    reasonCode: "payrun.created",
    responseStatus: 201,
  });
}

function assertTransitionData(command: PayRunTransitionCommand): void {
  const allowed = new Set(ALLOWED_DATA_KEYS[command.to]);
  for (const key of DATA_KEYS) {
    if (command.data[key] !== undefined && !allowed.has(key)) {
      throw new InvariantViolationError(`Transition to ${command.to} cannot pre-populate ${key}`);
    }
  }
}

function requireData<K extends keyof PayRunTransitionData>(
  data: PayRunTransitionData,
  key: K,
): NonNullable<PayRunTransitionData[K]> {
  const value = data[key];
  if (value === undefined) {
    throw new InvariantViolationError(`Transition requires ${key}`);
  }
  return value as NonNullable<PayRunTransitionData[K]>;
}

function assertAggregateAdvance(
  current: { id: string; projectId: string; version: number; createdAt: string; updatedAt: string } | undefined,
  next: { id: string; projectId: string; version: number; createdAt: string; updatedAt: string },
  label: string,
): void {
  if (!current) {
    if (next.version !== 1) {
      throw new InvariantViolationError(`${label} must start at version 1`);
    }
    return;
  }
  if (
    next.id !== current.id ||
    next.projectId !== current.projectId ||
    next.createdAt !== current.createdAt ||
    next.version !== current.version + 1 ||
    Date.parse(next.updatedAt) < Date.parse(current.updatedAt)
  ) {
    throw new InvariantViolationError(`${label} update must retain identity and increment version exactly once`);
  }
}

function assertFundingInstructionImmutable(
  current: FundingPreparation | undefined,
  next: FundingPreparation,
): void {
  assertAggregateAdvance(current, next, "FundingPreparation");
  if (
    current &&
    (next.intentDigest !== current.intentDigest ||
      next.budgetReservationId !== current.budgetReservationId ||
      next.policyDecisionId !== current.policyDecisionId ||
      next.approvedScopeDigest !== current.approvedScopeDigest ||
      next.idempotencyKey !== current.idempotencyKey ||
      next.planDigest !== current.planDigest ||
      next.requestedAmount.amountAtomic !== current.requestedAmount.amountAtomic ||
      next.requiredTarget.asset !== current.requiredTarget.asset ||
      next.requiredTarget.chainFamily !== current.requiredTarget.chainFamily)
  ) {
    throw new InvariantViolationError("Funding approved plan and instruction are immutable");
  }
}

function assertPaymentInstructionImmutable(
  current: PaymentExecution | undefined,
  next: PaymentExecution,
): void {
  assertAggregateAdvance(current, next, "PaymentExecution");
  if (
    current &&
    (next.instruction.id !== current.instruction.id ||
      next.instruction.instructionHash !== current.instruction.instructionHash ||
      next.instruction.executionKey !== current.instruction.executionKey ||
      next.instruction.fundingPreparationId !== current.instruction.fundingPreparationId ||
      next.instruction.merchantId !== current.instruction.merchantId ||
      next.instruction.rail !== current.instruction.rail ||
      next.instruction.amount.amountAtomic !== current.instruction.amount.amountAtomic ||
      next.instruction.target.asset !== current.instruction.target.asset ||
      next.instruction.target.chainFamily !== current.instruction.target.chainFamily)
  ) {
    throw new InvariantViolationError("PaymentInstruction and deterministic execution identity are immutable");
  }
}

function applyTransitionData(
  current: PayRun,
  command: PayRunTransitionCommand,
): Omit<PayRun, "status" | "version" | "updatedAt" | "lastAuditSequence" | "lastOutboxSequence"> {
  const next = { ...current };

  switch (command.to) {
    case "policy_evaluating": {
      const evaluation = requireData(command.data, "policyEvaluation");
      assertSameProject(current.projectId, evaluation);
      if (evaluation.payRunId !== current.id) {
        throw new InvariantViolationError("Policy evaluation attempt belongs to another PayRun");
      }
      if (current.status === "approved") {
        const decision = current.approval?.decision;
        const context = evaluation.recheckContext;
        if (
          !decision ||
          !context ||
          context.approvalDecisionId !== decision.id ||
          context.approvedScopeDigest !== current.approval?.request.approvalScopeDigest
        ) {
          throw new InvariantViolationError("approved must return through Approval-aware Policy recheck");
        }
      }
      return { ...next, policyEvaluation: evaluation };
    }
    case "policy_allowed":
    case "blocked": {
      const decision = requireData(command.data, "policyDecision");
      const expectedOutcome = command.to === "policy_allowed" ? "allowed" : "blocked";
      if (decision.outcome !== expectedOutcome) {
        throw new InvariantViolationError(`${command.to} requires PolicyDecision=${expectedOutcome}`);
      }
      if (
        current.approval?.status === "approved" &&
        command.to === "policy_allowed" &&
        decision.authorizationBasisApprovalDecisionId !== current.approval.decision?.id
      ) {
        throw new InvariantViolationError("Approval-aware Policy allow must retain authorization basis");
      }
      return { ...next, policyDecisions: [...current.policyDecisions, decision] };
    }
    case "pending_review": {
      const decision = requireData(command.data, "policyDecision");
      const approval = requireData(command.data, "approval");
      if (decision.outcome !== "needs_review" || approval.status !== "pending") {
        throw new InvariantViolationError("pending_review requires needs_review and pending Approval");
      }
      assertAggregateAdvance(undefined, approval, "Approval");
      return {
        ...next,
        policyDecisions: [...current.policyDecisions, decision],
        approval,
      };
    }
    case "approved":
    case "denied": {
      const approval = requireData(command.data, "approval");
      if (approval.status !== command.to) {
        throw new InvariantViolationError(`${command.to} requires matching Approval decision`);
      }
      assertAggregateAdvance(current.approval, approval, "Approval");
      const previousRequest = current.approval?.request;
      if (
        previousRequest &&
        (approval.request.id !== previousRequest.id ||
          approval.request.intentDigest !== previousRequest.intentDigest ||
          approval.request.policyId !== previousRequest.policyId ||
          approval.request.policyVersion !== previousRequest.policyVersion ||
          approval.request.policyChecksum !== previousRequest.policyChecksum ||
          approval.request.policyEvaluationDigest !== previousRequest.policyEvaluationDigest ||
          approval.request.agentId !== previousRequest.agentId ||
          approval.request.merchantId !== previousRequest.merchantId ||
          approval.request.purpose !== previousRequest.purpose ||
          approval.request.amount.amountAtomic !== previousRequest.amount.amountAtomic ||
          approval.request.amountCeiling.amountAtomic !== previousRequest.amountCeiling.amountAtomic ||
          approval.request.rail !== previousRequest.rail ||
          approval.request.fundingScopeDigest !== previousRequest.fundingScopeDigest ||
          approval.request.approvalScopeDigest !== previousRequest.approvalScopeDigest ||
          approval.request.requester.actorId !== previousRequest.requester.actorId ||
          approval.request.requester.actorType !== previousRequest.requester.actorType ||
          approval.request.coveredReasonCodes.length !== previousRequest.coveredReasonCodes.length ||
          approval.request.coveredReasonCodes.some(
            (reason, index) => reason !== previousRequest.coveredReasonCodes[index],
          ))
      ) {
        throw new InvariantViolationError("ApprovalRequest is immutable across its final decision");
      }
      return { ...next, approval };
    }
    case "funding_preparing":
    case "funding_prepared": {
      const funding = requireData(command.data, "fundingPreparation");
      assertFundingInstructionImmutable(current.fundingPreparation, funding);
      return { ...next, fundingPreparation: funding };
    }
    case "payment_executing":
    case "payment_unknown":
    case "payment_succeeded": {
      const payment = requireData(command.data, "paymentExecution");
      assertPaymentInstructionImmutable(current.paymentExecution, payment);
      return { ...next, paymentExecution: payment };
    }
    case "proof_collecting":
      return { ...next, proofRequest: requireData(command.data, "proofRequest") };
    case "proof_collected":
      return { ...next, executionProof: requireData(command.data, "executionProof") };
    case "ledger_recording":
      return { ...next, ledgerDraft: requireData(command.data, "ledgerDraft") };
    case "completed":
      return { ...next, ledgerJournal: requireData(command.data, "ledgerJournal") };
    case "expired": {
      const expiry = requireData(command.data, "expiry");
      if (expiry.expiredAtStage !== current.status) {
        throw new InvariantViolationError("Expiry must record the exact stage where it occurred");
      }
      return { ...next, expiry };
    }
    case "cancellation_pending":
    case "cancelled": {
      const cancellation = requireData(command.data, "cancellation");
      const expectedStatus = command.to === "cancelled" ? "cancelled" : "pending";
      if (cancellation.status !== expectedStatus) {
        throw new InvariantViolationError("Cancellation evidence does not match target state");
      }
      return { ...next, cancellation };
    }
    case "failed": {
      const failure = requireData(command.data, "failure");
      if (failure.stage !== current.status) {
        throw new InvariantViolationError("Failure evidence must name the source stage");
      }
      if (command.data.fundingPreparation) {
        assertFundingInstructionImmutable(
          current.fundingPreparation,
          command.data.fundingPreparation,
        );
      }
      if (command.data.paymentExecution) {
        assertPaymentInstructionImmutable(
          current.paymentExecution,
          command.data.paymentExecution,
        );
      }
      return {
        ...next,
        failure,
        ...(command.data.fundingPreparation
          ? { fundingPreparation: command.data.fundingPreparation }
          : {}),
        ...(command.data.paymentExecution
          ? { paymentExecution: command.data.paymentExecution }
          : {}),
      };
    }
    case "intent_recorded":
      throw new InvalidTransitionError(current.status, command.to);
  }
}

const PRE_EFFECT_EXPIRY_TARGETS: readonly PayRunStatus[] = [
  "policy_allowed",
  "pending_review",
  "approved",
  "funding_preparing",
  "funding_prepared",
  "payment_executing",
];

export function transitionPayRun(
  current: PayRun,
  command: PayRunTransitionCommand,
): PayRunTransitionResult {
  if (command.expectedVersion !== current.version) {
    throw new VersionConflictError(command.expectedVersion, current.version, current.id);
  }
  if ((TERMINAL_PAY_RUN_STATUSES as readonly PayRunStatus[]).includes(current.status)) {
    throw new TerminalStateError(current.status);
  }
  if (!canTransition(current.status, command.to)) {
    throw new InvalidTransitionError(current.status, command.to);
  }

  assertPayRunInvariants(current);
  assertUtcIso(command.occurredAt, "transition.occurredAt");
  assertUtcIso(command.idempotencyRetentionUntil, "transition.idempotencyRetentionUntil");
  if (Date.parse(command.idempotencyRetentionUntil) <= Date.parse(command.occurredAt)) {
    throw new InvariantViolationError("Idempotency retention must extend beyond command time");
  }
  if (Date.parse(command.occurredAt) < Date.parse(current.updatedAt)) {
    throw new InvariantViolationError("Transition time cannot move backwards");
  }
  if (PRE_EFFECT_EXPIRY_TARGETS.includes(command.to)) {
    assertIntentCurrent(current.intent, command.occurredAt);
  }
  if (command.to === "approved" && current.approval) {
    if (Date.parse(current.approval.request.expiresAt) <= Date.parse(command.occurredAt)) {
      throw new IntentExpiredError(current.approval.request.expiresAt, command.occurredAt);
    }
  }
  assertTransitionData(command);

  const dataApplied = applyTransitionData(current, command);
  const next: PayRun = {
    ...dataApplied,
    status: command.to,
    version: current.version + 1,
    updatedAt: command.occurredAt,
    lastAuditSequence: current.lastAuditSequence + 1,
    lastOutboxSequence: current.lastOutboxSequence + 1,
  };
  assertPayRunInvariants(next);
  const frozenPayRun = deepFreeze(structuredClone(next));

  return buildTransitionResult({
    payRun: frozenPayRun,
    beforeVersion: current.version,
    beforeStatus: current.status,
    occurredAt: command.occurredAt,
    commandType: command.commandType,
    idempotencyRecordId: command.idempotencyRecordId,
    idempotencyKey: command.idempotencyKey,
    requestHash: command.requestHash,
    idempotencyRetentionUntil: command.idempotencyRetentionUntil,
    auditEventId: command.auditEventId,
    outboxEventId: command.outboxEventId,
    correlationId: command.correlationId,
    actor: command.actor,
    reasonCode: command.reasonCode,
    responseStatus: 200,
  });
}

export function recordApprovalDecision(
  current: Approval,
  command: ApprovalDecisionCommand,
): Approval {
  if (command.expectedVersion !== current.version) {
    throw new VersionConflictError(command.expectedVersion, current.version, current.id);
  }
  if (current.status !== "pending" || current.decision) {
    throw new ApprovalConflictError(current.id, current.status);
  }
  assertUtcIso(command.updatedAt, "approval.updatedAt");
  if (Date.parse(current.request.expiresAt) <= Date.parse(command.updatedAt)) {
    throw new IntentExpiredError(current.request.expiresAt, command.updatedAt);
  }
  assertSameProject(current.projectId, command.decision);
  if (
    command.decision.approvalId !== current.id ||
    command.decision.payRunId !== current.payRunId ||
    command.decision.approvalScopeDigest !== current.request.approvalScopeDigest
  ) {
    throw new InvariantViolationError("Approval decision does not match request identity and scope");
  }
  if (!command.decision.reviewerId) {
    throw new InvariantViolationError("Authenticated reviewer identity is required");
  }
  if (
    command.decision.approver.actorType !== "user" ||
    command.decision.approver.actorId !== command.decision.reviewerId ||
    command.decision.approver.actorId === current.request.requester.actorId
  ) {
    throw new InvariantViolationError("Approval requires a distinct authenticated human approver");
  }

  return deepFreeze({
    ...current,
    status: command.decision.outcome,
    decision: command.decision,
    version: current.version + 1,
    updatedAt: command.updatedAt,
  });
}
