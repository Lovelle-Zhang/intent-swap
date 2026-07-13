import type {
  Approval,
  ApprovalDecision,
  ApprovalRequest,
  AuditEvent,
  CancellationRecord,
  DomainOutboxEvent,
  EvidenceKind,
  EvidenceReference,
  ExecutionProof,
  ExecutionProofRequest,
  ExpiryRecord,
  FailureRecord,
  FundingPreparation,
  FundingPreparationStatus,
  IdempotencyRecord,
  LedgerDraft,
  LedgerJournal,
  LogicalSettlementTarget,
  Money,
  PayIntent,
  PaymentExecution,
  PaymentExecutionStatus,
  PayRun,
  PayRunStatus,
  PayRunTransitionCommand,
  PayRunTransitionData,
  PolicyDecision,
  PolicyEvaluationAttempt,
} from "@/features/payrun/domain/types";

export const PROJECT_ID = "project_zenfix_test";
export const OTHER_PROJECT_ID = "project_other";
export const PAY_RUN_ID = "payrun_test_001";
export const CREATED_AT = "2026-07-12T00:00:00.000Z";
export const UPDATED_AT = "2026-07-12T00:01:00.000Z";
export const TRANSITION_AT = "2026-07-12T00:02:00.000Z";
export const EXPIRES_AT = "2026-07-13T00:00:00.000Z";

export const logicalTarget: LogicalSettlementTarget = {
  kind: "logical",
  chainFamily: "base",
  asset: "USDC",
  decimals: 6,
};

export function money(amountAtomic = "420000"): Money {
  return {
    amountAtomic,
    asset: "USDC",
    settlementRef: logicalTarget,
    decimals: 6,
  };
}

export function sandboxEvidence<K extends EvidenceKind>(
  kind: K,
  reference = `sandbox:${kind}:001`,
): EvidenceReference & { readonly kind: K } {
  return {
    environment: "sandbox",
    kind,
    provider: "sandbox_simulated",
    reference,
    observedStatus: "verified",
    checksum: `sha256:${kind}:001`,
    capturedAt: UPDATED_AT,
    verificationMethod: "deterministic_fixture",
    synthetic: true,
    transactionHash: null,
  };
}

export function buildIntent(overrides: Partial<PayIntent> = {}): PayIntent {
  return {
    id: "intent_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    source: "simulator",
    agentId: "agent_001",
    taskId: "task_001",
    purpose: "Purchase a verified API result",
    merchant: {
      merchantId: "merchant_known",
      payee: "api.example.test",
      category: "api",
      trustState: "known",
    },
    maximumAmount: money("500000"),
    quotedAmount: money("420000"),
    expectedArtifactType: "api_result",
    settlementTarget: logicalTarget,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    digest: "sha256:intent:001",
    ...overrides,
  };
}

export function buildPolicyDecision(
  outcome: PolicyDecision["outcome"] = "allowed",
  overrides: Partial<PolicyDecision> = {},
): PolicyDecision {
  const reasonCode =
    outcome === "allowed"
      ? "merchant.allowed"
      : outcome === "needs_review"
        ? "approval.threshold_reached"
        : "merchant.unknown";
  const checkOutcome =
    outcome === "allowed" ? "pass" : outcome === "needs_review" ? "review" : "block";

  return {
    id: `decision_${outcome}_001`,
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    payIntentId: "intent_001",
    policyId: "policy_001",
    policyVersion: 1,
    policyChecksum: "sha256:policy:001",
    engineVersion: "1.0.0",
    inputSnapshotDigest: `sha256:input:${outcome}`,
    outcome,
    checks: [
      {
        sequence: 1,
        ruleClass: outcome === "needs_review" ? "review" : "payee",
        reasonCode,
        outcome: checkOutcome,
        explanation: `Fixture result: ${reasonCode}`,
      },
    ],
    reasonCodes: outcome === "allowed" ? [] : [reasonCode],
    riskLevel: outcome === "blocked" ? "high" : "low",
    evaluatedAt: UPDATED_AT,
    validUntil: EXPIRES_AT,
    nextAction:
      outcome === "allowed"
        ? "prepare_funding"
        : outcome === "needs_review"
          ? "request_approval"
          : "stop",
    evaluatedBy: {
      service: "zenfix_policy_engine",
      engineVersion: "1.0.0",
    },
    policySnapshot: {
      projectId: PROJECT_ID,
      policyId: "policy_001",
      policyVersion: 1,
      policyChecksum: "sha256:policy:001",
      inputSnapshotDigest: `sha256:input:${outcome}`,
    },
    decision: {
      outcome,
      reasonCodes: outcome === "allowed" ? [] : [reasonCode],
      riskLevel: outcome === "blocked" ? "high" : "low",
      nextAction:
        outcome === "allowed"
          ? "prepare_funding"
          : outcome === "needs_review"
            ? "request_approval"
            : "stop",
    },
    ...overrides,
  };
}

export function buildEvaluationAttempt(
  overrides: Partial<PolicyEvaluationAttempt> = {},
): PolicyEvaluationAttempt {
  return {
    id: "evaluation_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    attempt: 1,
    startedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildApprovalRequest(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
    id: "approval_request_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    payIntentId: "intent_001",
    createdAt: UPDATED_AT,
    expiresAt: EXPIRES_AT,
    createdAtPayRunVersion: 3,
    intentDigest: "sha256:intent:001",
    policyDecisionId: "decision_needs_review_001",
    policyId: "policy_001",
    policyVersion: 1,
    policyEvaluationDigest: "sha256:input:needs_review",
    merchantId: "merchant_known",
    amount: money("420000"),
    settlementTarget: logicalTarget,
    rail: "sandbox",
    fundingScopeDigest: "sha256:funding-scope:001",
    coveredReasonCodes: ["approval.threshold_reached"],
    approvalScopeDigest: "sha256:approval-scope:001",
    generation: 1,
    ...overrides,
  };
}

export function buildApprovalDecision(
  outcome: ApprovalDecision["outcome"] = "approved",
  overrides: Partial<ApprovalDecision> = {},
): ApprovalDecision {
  return {
    id: `approval_decision_${outcome}_001`,
    projectId: PROJECT_ID,
    approvalId: "approval_001",
    payRunId: PAY_RUN_ID,
    outcome,
    reviewerId: "reviewer_server_context",
    decidedAt: UPDATED_AT,
    reasonCode: outcome === "approved" ? "approval.granted" : "approval.rejected",
    approvalScopeDigest: "sha256:approval-scope:001",
    ...overrides,
  };
}

export function buildApproval(
  status: Approval["status"] = "pending",
  overrides: Partial<Approval> = {},
): Approval {
  const request = buildApprovalRequest();
  const decision =
    status === "approved"
      ? buildApprovalDecision("approved")
      : status === "denied"
        ? buildApprovalDecision("denied")
        : undefined;
  return {
    id: "approval_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    version: status === "pending" ? 1 : 2,
    status,
    request,
    ...(decision ? { decision } : {}),
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildFundingPreparation(
  status: FundingPreparationStatus = "not_required",
  overrides: Partial<FundingPreparation> = {},
): FundingPreparation {
  const prepared = ["not_required", "sandbox_prepared", "prepared"].includes(status);
  return {
    id: "funding_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    version: status === "requested" || status === "planned" ? 1 : 2,
    intentDigest: "sha256:intent:001",
    policyDecisionId: "decision_allowed_001",
    approvedScopeDigest: "sha256:funding-scope:001",
    idempotencyKey: "funding-idempotency-001",
    source: {
      chainFamily: "base",
      asset: "USDC",
      accountRef: "sandbox:reservation:001",
      amountAtomic: "420000",
      decimals: 6,
    },
    requiredTarget: logicalTarget,
    requestedAmount: money("420000"),
    action: "none",
    route: [],
    attempts: [
      {
        id: "funding_attempt_001",
        projectId: PROJECT_ID,
        payRunId: PAY_RUN_ID,
        fundingPreparationId: "funding_001",
        executionKey: "funding-execution-key-001",
        planDigest: "sha256:funding-plan:001",
        outcome: prepared ? "final_success" : "prepared",
        createdAt: UPDATED_AT,
        ...(prepared ? { evidence: sandboxEvidence("sandbox_funding_evidence") } : {}),
      },
    ],
    status,
    planDigest: "sha256:funding-plan:001",
    quoteReference: null,
    expiresAt: EXPIRES_AT,
    evidence: prepared ? sandboxEvidence("sandbox_funding_evidence") : undefined,
    transactionHash: null,
    realFundsAvailable: false,
    realBridgeCapability: false,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildPaymentExecution(
  status: PaymentExecutionStatus = "succeeded",
  overrides: Partial<PaymentExecution> = {},
): PaymentExecution {
  const evidence =
    status === "succeeded"
      ? sandboxEvidence("sandbox_payment_evidence")
      : status === "failed_no_transfer"
        ? sandboxEvidence("sandbox_no_transfer_evidence")
        : undefined;
  return {
    id: "payment_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    version: status === "prepared" ? 1 : 2,
    instruction: {
      id: "payment_instruction_001",
      projectId: PROJECT_ID,
      payRunId: PAY_RUN_ID,
      fundingPreparationId: "funding_001",
      merchantId: "merchant_known",
      rail: "sandbox",
      amount: money("420000"),
      target: logicalTarget,
      instructionHash: "sha256:payment-instruction:001",
      executionKey: "execution-key-001",
      createdAt: UPDATED_AT,
    },
    status,
    providerReference: status === "prepared" ? null : "sandbox:payment:001",
    evidence,
    reconciliationState: status === "unknown" ? "scheduled" : "not_required",
    attempts: [
      {
        id: "execution_attempt_001",
        projectId: PROJECT_ID,
        payRunId: PAY_RUN_ID,
        paymentExecutionId: "payment_001",
        executionKey: "execution-key-001",
        instructionHash: "sha256:payment-instruction:001",
        outcome:
          status === "unknown"
            ? "unknown"
            : status === "succeeded"
              ? "final_success"
              : status === "failed_no_transfer"
                ? "final_failure"
                : status,
        createdAt: UPDATED_AT,
      },
    ],
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildProofRequest(
  overrides: Partial<ExecutionProofRequest> = {},
): ExecutionProofRequest {
  return {
    id: "proof_request_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    paymentExecutionId: "payment_001",
    artifactType: "api_result",
    provider: "sandbox_artifact_provider",
    createdAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildExecutionProof(
  overrides: Partial<ExecutionProof> = {},
): ExecutionProof {
  return {
    id: "proof_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    paymentExecutionId: "payment_001",
    requestId: "proof_request_001",
    provider: "sandbox_artifact_provider",
    artifactType: "api_result",
    artifactReference: "sandbox:artifact:001",
    checksum: "sha256:artifact:001",
    verificationStatus: "verified",
    outcome: "positive",
    evidence: sandboxEvidence("sandbox_execution_proof"),
    capturedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildLedgerDraft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    id: "ledger_draft_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    paymentExecutionId: "payment_001",
    executionProofId: "proof_001",
    environment: "sandbox",
    assetRef: logicalTarget,
    externalReference: "sandbox:payment:001",
    evidenceHash: "sha256:artifact:001",
    entries: [
      {
        id: "ledger_entry_debit_001",
        projectId: PROJECT_ID,
        journalId: "ledger_journal_001",
        accountId: "sandbox:agent-spend",
        debitAtomic: "420000",
        creditAtomic: "0",
        evidenceHash: "sha256:artifact:001",
      },
      {
        id: "ledger_entry_credit_001",
        projectId: PROJECT_ID,
        journalId: "ledger_journal_001",
        accountId: "sandbox:merchant-payable",
        debitAtomic: "0",
        creditAtomic: "420000",
        evidenceHash: "sha256:artifact:001",
      },
    ],
    preparedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildLedgerJournal(
  overrides: Partial<LedgerJournal> = {},
): LedgerJournal {
  const draft = buildLedgerDraft();
  return {
    id: "ledger_journal_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    version: 1,
    paymentExecutionId: draft.paymentExecutionId,
    executionProofId: draft.executionProofId,
    environment: draft.environment,
    assetRef: draft.assetRef,
    externalReference: draft.externalReference,
    evidenceHash: draft.evidenceHash,
    entries: draft.entries,
    committedAt: UPDATED_AT,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

export function buildAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "audit_008",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    aggregateType: "PayRun",
    aggregateId: PAY_RUN_ID,
    sequence: 8,
    beforeVersion: 7,
    afterVersion: 8,
    actor: { actorId: "actor_server", actorType: "system" },
    actionCode: "payrun.transition",
    reasonCode: "test.transition",
    idempotencyKey: "transition-idempotency-008",
    correlationId: "correlation-008",
    occurredAt: TRANSITION_AT,
    details: { fromStatus: "intent_recorded", toStatus: "policy_evaluating" },
    ...overrides,
  };
}

export function buildOutboxEvent(
  overrides: Partial<DomainOutboxEvent> = {},
): DomainOutboxEvent {
  const aggregateId = overrides.aggregateId ?? PAY_RUN_ID;
  const aggregateVersion = overrides.aggregateVersion ?? 8;
  return {
    id: "outbox_008",
    projectId: PROJECT_ID,
    aggregateType: "PayRun",
    aggregateId,
    aggregateVersion,
    sequence: 8,
    eventType: "payrun.transitioned",
    schemaVersion: 1,
    payload: {
      payRunId: aggregateId,
      fromStatus: "intent_recorded",
      toStatus: "policy_evaluating",
      beforeVersion: 7,
      afterVersion: aggregateVersion,
    },
    occurredAt: TRANSITION_AT,
    ...overrides,
  };
}

export function buildIdempotencyRecord(
  overrides: Partial<IdempotencyRecord> = {},
): IdempotencyRecord {
  return {
    id: "idempotency_008",
    projectId: PROJECT_ID,
    version: 1,
    commandType: "transition_payrun",
    key: "transition-idempotency-008",
    requestHash: "sha256:transition-request:008",
    state: "completed",
    resultResourceId: PAY_RUN_ID,
    resultVersion: 8,
    responseStatus: 200,
    retentionUntil: "2027-07-12T00:00:00.000Z",
    createdAt: TRANSITION_AT,
    updatedAt: TRANSITION_AT,
    ...overrides,
  };
}

function buildCancellation(status: CancellationRecord["status"]): CancellationRecord {
  return {
    id: "cancellation_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    status,
    requestedBy: "actor_server",
    requestedAt: UPDATED_AT,
    externalEffectPossible: false,
    reasonCode: "operator.cancelled",
    ...(status === "cancelled"
      ? {
          completedAt: UPDATED_AT,
          safeReleaseEvidence: sandboxEvidence("sandbox_safe_release_evidence"),
        }
      : {}),
  };
}

function buildExpiry(expiredAtStage: PayRunStatus): ExpiryRecord {
  return {
    expiredAtStage,
    reasonCode: "intent.expired",
    expiredAt: UPDATED_AT,
    evidence: sandboxEvidence("sandbox_expiry_evidence"),
    externalEffectPossible: false,
  };
}

function buildFailure(stage: PayRunStatus): FailureRecord {
  return {
    stage,
    reasonCode: "stage.authoritative_failure",
    failedAt: UPDATED_AT,
    externalEffectAttempted: false,
  };
}

export function buildPayRunAt(status: PayRunStatus): PayRun {
  const base: PayRun = {
    id: PAY_RUN_ID,
    projectId: PROJECT_ID,
    version: 7,
    environment: "sandbox",
    status,
    creationIdempotencyKey: "create-payrun-001",
    intent: buildIntent(),
    intentDigest: "sha256:intent:001",
    policyDecisions: [],
    lastAuditSequence: 7,
    lastOutboxSequence: 7,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };

  switch (status) {
    case "intent_recorded":
      return base;
    case "policy_evaluating":
      return { ...base, policyEvaluation: buildEvaluationAttempt() };
    case "policy_allowed":
      return { ...base, policyDecisions: [buildPolicyDecision("allowed")] };
    case "pending_review":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("needs_review")],
        approval: buildApproval("pending"),
      };
    case "approved":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("needs_review")],
        approval: buildApproval("approved"),
      };
    case "funding_preparing":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("requested"),
      };
    case "funding_prepared":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
      };
    case "payment_executing":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("prepared"),
      };
    case "payment_unknown":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("unknown"),
      };
    case "payment_succeeded":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("succeeded"),
      };
    case "proof_collecting":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("succeeded"),
        proofRequest: buildProofRequest(),
      };
    case "proof_collected":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("succeeded"),
        proofRequest: buildProofRequest(),
        executionProof: buildExecutionProof(),
      };
    case "ledger_recording":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("succeeded"),
        proofRequest: buildProofRequest(),
        executionProof: buildExecutionProof(),
        ledgerDraft: buildLedgerDraft(),
      };
    case "completed":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("allowed")],
        fundingPreparation: buildFundingPreparation("not_required"),
        paymentExecution: buildPaymentExecution("succeeded"),
        proofRequest: buildProofRequest(),
        executionProof: buildExecutionProof(),
        ledgerDraft: buildLedgerDraft(),
        ledgerJournal: buildLedgerJournal(),
      };
    case "blocked":
      return { ...base, policyDecisions: [buildPolicyDecision("blocked")] };
    case "denied":
      return {
        ...base,
        policyDecisions: [buildPolicyDecision("needs_review")],
        approval: buildApproval("denied"),
      };
    case "expired":
      return { ...base, expiry: buildExpiry("intent_recorded") };
    case "cancellation_pending":
      return { ...base, cancellation: buildCancellation("pending") };
    case "cancelled":
      return { ...base, cancellation: buildCancellation("cancelled") };
    case "failed":
      return {
        ...base,
        policyEvaluation: buildEvaluationAttempt({
          errorCode: "policy.non_retryable_failure",
          retryable: false,
        }),
        failure: buildFailure("policy_evaluating"),
      };
  }
}

export function buildTransitionCommand(
  current: PayRun,
  to: PayRunStatus,
  overrides: Partial<PayRunTransitionCommand> = {},
): PayRunTransitionCommand {
  const data: { -readonly [K in keyof PayRunTransitionData]?: PayRunTransitionData[K] } = {};

  switch (to) {
    case "policy_evaluating":
      data.policyEvaluation = buildEvaluationAttempt({
        attempt: (current.policyEvaluation?.attempt ?? 0) + 1,
        ...(current.status === "approved" && current.approval?.decision
          ? {
              recheckContext: {
                approvalDecisionId: current.approval.decision.id,
                approvedScopeDigest: current.approval.request.approvalScopeDigest,
                coveredReasonCodes: current.approval.request.coveredReasonCodes,
              },
            }
          : {}),
      });
      break;
    case "policy_allowed":
      data.policyDecision = buildPolicyDecision("allowed", {
        ...(current.approval?.decision?.outcome === "approved"
          ? { authorizationBasisApprovalDecisionId: current.approval.decision.id }
          : {}),
      });
      break;
    case "pending_review":
      data.policyDecision = buildPolicyDecision("needs_review");
      data.approval = buildApproval("pending");
      break;
    case "blocked":
      data.policyDecision = buildPolicyDecision("blocked");
      break;
    case "approved":
      data.approval = buildApproval("approved", {
        request: current.approval?.request ?? buildApprovalRequest(),
      });
      break;
    case "denied":
      data.approval = buildApproval("denied", {
        request: current.approval?.request ?? buildApprovalRequest(),
      });
      break;
    case "funding_preparing":
      data.fundingPreparation = buildFundingPreparation("requested", {
        version: (current.fundingPreparation?.version ?? 0) + 1,
      });
      break;
    case "funding_prepared":
      data.fundingPreparation = buildFundingPreparation("not_required", {
        version: (current.fundingPreparation?.version ?? 1) + 1,
      });
      break;
    case "payment_executing":
      data.paymentExecution = buildPaymentExecution("prepared");
      break;
    case "payment_unknown":
      data.paymentExecution = buildPaymentExecution("unknown", {
        version: (current.paymentExecution?.version ?? 1) + 1,
      });
      break;
    case "payment_succeeded":
      data.paymentExecution = buildPaymentExecution("succeeded", {
        version: (current.paymentExecution?.version ?? 1) + 1,
      });
      break;
    case "proof_collecting":
      data.proofRequest = buildProofRequest();
      break;
    case "proof_collected":
      data.executionProof = buildExecutionProof();
      break;
    case "ledger_recording":
      data.ledgerDraft = buildLedgerDraft();
      break;
    case "completed":
      data.ledgerJournal = buildLedgerJournal();
      break;
    case "expired":
      data.expiry = {
        ...buildExpiry(current.status),
        ...(current.status === "funding_preparing" || current.status === "funding_prepared"
          ? { safeReleaseEvidence: sandboxEvidence("sandbox_safe_release_evidence") }
          : {}),
      };
      break;
    case "cancellation_pending":
      data.cancellation = {
        ...buildCancellation("pending"),
        ...(current.status === "funding_preparing" || current.status === "funding_prepared"
          ? { safeReleaseEvidence: sandboxEvidence("sandbox_safe_release_evidence") }
          : {}),
      };
      break;
    case "cancelled":
      data.cancellation = buildCancellation("cancelled");
      break;
    case "failed":
      data.failure = {
        ...buildFailure(current.status),
        ...(current.status === "payment_executing" || current.status === "payment_unknown"
          ? {
              externalEffectAttempted: true,
              noValueMovedEvidence: sandboxEvidence("sandbox_no_transfer_evidence"),
            }
          : {}),
      };
      if (current.status === "payment_executing" || current.status === "payment_unknown") {
        data.paymentExecution = buildPaymentExecution("failed_no_transfer", {
          version: (current.paymentExecution?.version ?? 1) + 1,
        });
      }
      if (current.status === "funding_preparing" || current.status === "funding_prepared") {
        data.fundingPreparation = buildFundingPreparation("failed", {
          version: (current.fundingPreparation?.version ?? 1) + 1,
          evidence: sandboxEvidence("sandbox_no_transfer_evidence"),
        });
      }
      break;
    case "intent_recorded":
      break;
  }

  return {
    to,
    expectedVersion: current.version,
    occurredAt: TRANSITION_AT,
    commandType: `transition_to_${to}`,
    idempotencyRecordId: `idempotency_${to}`,
    idempotencyKey: `idempotency-key-${current.status}-${to}`,
    requestHash: `sha256:request:${current.status}:${to}`,
    idempotencyRetentionUntil: "2027-07-12T00:02:00.000Z",
    auditEventId: `audit_${current.status}_${to}`,
    outboxEventId: `outbox_${current.status}_${to}`,
    correlationId: `correlation_${current.status}_${to}`,
    actor: { actorId: "actor_server", actorType: "system" },
    reasonCode: `test.${current.status}.${to}`,
    data,
    ...overrides,
  };
}
