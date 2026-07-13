import {
  activateBudgetReservation,
  consumeBudgetReservation,
  releaseBudgetReservation,
} from "../domain/budget-reservation";
import { IdempotencyConflictError, InvariantViolationError } from "../domain/errors";
import { createPayRun, transitionPayRun } from "../domain/state-machine";
import type {
  Approval,
  BudgetReservation,
  ExecutionProof,
  ExecutionProofRequest,
  FundingPreparation,
  LedgerDraft,
  LedgerJournal,
  PayRun,
  PayRunTransitionData,
  PayRunTransitionResult,
  PaymentExecution,
  PolicyDecision,
} from "../domain/types";
import type {
  AuditEventRepository,
  BudgetReservationRepository,
  IdempotencyRepository,
  PayRunRepository,
  PayRunUnitOfWork,
  PayRunUnitOfWorkContext,
} from "./ports";
import type { ExecuteSandboxPayRunCommand, SandboxScenarioId } from "./control-loop-commands";
import {
  projectPayRunExplanation,
  projectValidationReceipt,
  type PayRunExplanation,
  type ValidationReceiptProjection,
} from "./payrun-explanation";

const STAGE_TIMES = [
  "2026-07-13T10:00:00.000Z", "2026-07-13T10:01:00.000Z",
  "2026-07-13T10:02:00.000Z", "2026-07-13T10:03:00.000Z",
  "2026-07-13T10:04:00.000Z", "2026-07-13T10:05:00.000Z",
  "2026-07-13T10:06:00.000Z", "2026-07-13T10:07:00.000Z",
  "2026-07-13T10:08:00.000Z", "2026-07-13T10:09:00.000Z",
  "2026-07-13T10:10:00.000Z",
] as const;
const IDEMPOTENCY_RETENTION = "2027-07-13T00:00:00.000Z";

export interface SandboxScenarioApplicationFixture {
  readonly scenarioId: SandboxScenarioId;
  readonly project: import("../domain/types").Project;
  readonly agent: import("../domain/types").Agent;
  readonly merchant: import("../domain/types").Merchant;
  readonly intent: import("../domain/types").PayIntent;
  readonly policyRequest: import("../domain/types").PolicyEvaluationRequest;
  readonly fundingScopeDigest: string;
}

export interface SandboxControlLoopPersistence {
  readonly payRuns: PayRunRepository;
  readonly budgetReservations: BudgetReservationRepository;
  readonly auditEvents: AuditEventRepository;
  readonly idempotency: IdempotencyRepository;
  readonly unitOfWork: PayRunUnitOfWork;
}

export interface SandboxControlLoopDependencies {
  readonly persistence: SandboxControlLoopPersistence;
  readonly hash: (value: unknown) => string;
  readonly fixture: (projectId: string, payRunId: string, scenarioId: SandboxScenarioId) => SandboxScenarioApplicationFixture;
  readonly payRunId: (projectId: string, idempotencyKey: string) => string;
  readonly evaluatePolicy: (fixture: SandboxScenarioApplicationFixture) => Promise<PolicyDecision>;
  readonly prepareFunding: (fixture: SandboxScenarioApplicationFixture, reservation: BudgetReservation, decision: PolicyDecision, occurredAt: string) => FundingPreparation;
  readonly completeFunding: (current: FundingPreparation, occurredAt: string) => FundingPreparation;
  readonly preparePayment: (payRun: PayRun, funding: FundingPreparation, occurredAt: string) => PaymentExecution;
  readonly completePayment: (current: PaymentExecution, occurredAt: string) => PaymentExecution;
  readonly prepareProofRequest: (payRun: PayRun, payment: PaymentExecution, occurredAt: string) => ExecutionProofRequest;
  readonly collectProof: (request: ExecutionProofRequest, occurredAt: string) => ExecutionProof;
  readonly buildLedgerDraft: (payment: PaymentExecution, proof: ExecutionProof, occurredAt: string) => LedgerDraft;
  readonly commitLedger: (draft: LedgerDraft, occurredAt: string) => LedgerJournal;
}

export interface SandboxControlLoopResult {
  readonly payRun: PayRun;
  readonly reservation: BudgetReservation | null;
  readonly transitions: readonly PayRun["status"][];
  readonly explanation: PayRunExplanation;
  readonly validationReceipt: ValidationReceiptProjection;
}

type TransactionExtension = (
  context: PayRunUnitOfWorkContext,
  result: PayRunTransitionResult,
) => Promise<void>;

export class SandboxPayRunControlLoopService {
  constructor(private readonly dependencies: SandboxControlLoopDependencies) {}

  async execute(command: ExecuteSandboxPayRunCommand): Promise<SandboxControlLoopResult> {
    if (command.requester.actorType !== "agent" && command.requester.actorType !== "user") {
      throw new InvariantViolationError("Sandbox PayRun requester must be an authenticated agent or user");
    }
    const payRunId = this.dependencies.payRunId(command.projectId, command.idempotencyKey);
    const rootHash = this.dependencies.hash({
      projectId: command.projectId,
      scenarioId: command.scenarioId,
      requester: command.requester,
    });
    const existing = await this.dependencies.persistence.idempotency.get(
      command.projectId,
      "create_payrun",
      command.idempotencyKey,
    );
    if (existing) {
      if (existing.requestHash !== rootHash) {
        throw new IdempotencyConflictError("create_payrun", command.idempotencyKey);
      }
      const stored = await this.dependencies.persistence.payRuns.get(command.projectId, payRunId);
      if (!stored) throw new InvariantViolationError("Committed PayRun idempotency result is missing");
      if (stored.status === "proof_collecting") {
        return this.completeFromProofCollecting(stored, command);
      }
      return this.result(stored);
    }

    const fixture = this.dependencies.fixture(command.projectId, payRunId, command.scenarioId);
    let payRun = await this.create(command, fixture, rootHash);

    payRun = await this.transition(payRun, 1, "policy_evaluating", "policy.evaluation_started", {
      policyEvaluation: {
        id: `evaluation_${payRun.id}`,
        projectId: payRun.projectId,
        payRunId: payRun.id,
        attempt: 1,
        startedAt: STAGE_TIMES[1],
      },
    }, command);

    const decision = await this.dependencies.evaluatePolicy(fixture);
    if (decision.outcome === "needs_review") {
      const approval = this.buildPendingApproval(payRun, decision, fixture, command);
      payRun = await this.transition(payRun, 2, "pending_review", "policy.review_required", {
        policyDecision: decision,
        approval,
      }, command, async (context) => context.approvals.insert(payRun.projectId, approval));
      return this.result(payRun);
    }
    if (decision.outcome === "blocked") {
      payRun = await this.transition(payRun, 2, "blocked", decision.reasonCodes[0] ?? "policy.blocked", {
        policyDecision: decision,
      }, command);
      return this.result(payRun);
    }

    payRun = await this.transition(payRun, 2, "policy_allowed", "policy.allowed", {
      policyDecision: decision,
    }, command);

    const reservation = activateBudgetReservation({
      id: `reservation_${payRun.id}`,
      projectId: payRun.projectId,
      payRunId: payRun.id,
      agentId: payRun.intent.agentId,
      merchantId: payRun.intent.merchant.merchantId,
      rail: fixture.policyRequest.rail,
      scopeGeneration: 1,
      policyDecisionId: decision.id,
      policyId: decision.policyId,
      policyVersion: decision.policyVersion,
      policyChecksum: decision.policyChecksum,
      policyEvaluationDigest: decision.inputSnapshotDigest,
      intentDigest: payRun.intentDigest,
      approvalScopeDigest: null,
      approvalDecisionId: null,
      fundingScopeDigest: fixture.fundingScopeDigest,
      budgetKeys: [
        `project:${payRun.projectId}`,
        `agent:${payRun.intent.agentId}`,
        `merchant:${payRun.intent.merchant.merchantId}`,
        `rail:${fixture.policyRequest.rail}`,
      ],
      reservedAmount: payRun.intent.quotedAmount,
      environment: "sandbox",
      expiresAt: payRun.intent.expiresAt,
      terminalReasonCode: null,
      terminalEvidence: null,
    }, STAGE_TIMES[3]);
    const fundingRequested = this.dependencies.prepareFunding(fixture, reservation, decision, STAGE_TIMES[3]);
    payRun = await this.transition(payRun, 3, "funding_preparing", "reservation.activated", {
      fundingPreparation: fundingRequested,
    }, command, async (context) => {
      await context.budgetReservations.insert(payRun.projectId, reservation);
      await context.fundingPreparations.insert(payRun.projectId, fundingRequested);
    });

    const fundingCompleted = this.dependencies.completeFunding(fundingRequested, STAGE_TIMES[4]);
    payRun = await this.transition(payRun, 4, "funding_prepared", "funding.prepared", {
      fundingPreparation: fundingCompleted,
    }, command, async (context) => {
      await context.fundingPreparations.compareAndSet(
        payRun.projectId, fundingRequested.id, fundingRequested.version, fundingRequested.status, fundingCompleted,
      );
    });

    const paymentPrepared = this.dependencies.preparePayment(payRun, fundingCompleted, STAGE_TIMES[5]);
    payRun = await this.transition(payRun, 5, "payment_executing", "payment.prepared", {
      paymentExecution: paymentPrepared,
    }, command, async (context) => context.paymentExecutions.insert(payRun.projectId, paymentPrepared));

    const paymentCompleted = this.dependencies.completePayment(paymentPrepared, STAGE_TIMES[6]);
    if (paymentCompleted.status === "failed_no_transfer") {
      if (!paymentCompleted.evidence || paymentCompleted.evidence.kind !== "sandbox_no_transfer_evidence") {
        throw new InvariantViolationError("Sandbox payment failure requires authoritative no-transfer evidence");
      }
      const releaseEvidence = {
        ...paymentCompleted.evidence,
        kind: "sandbox_safe_release_evidence" as const,
        reference: `sandbox:safe-release:${paymentCompleted.id}`,
        checksum: this.dependencies.hash({
          paymentExecutionId: paymentCompleted.id,
          paymentEvidenceChecksum: paymentCompleted.evidence.checksum,
          release: "authoritative_no_transfer",
        }),
      };
      const released = releaseBudgetReservation(reservation, {
        expectedVersion: reservation.version,
        occurredAt: STAGE_TIMES[6],
        reasonCode: "payment.authoritative_no_transfer",
        evidence: releaseEvidence,
      });
      payRun = await this.transition(payRun, 6, "failed", "payment.authoritative_no_transfer", {
        paymentExecution: paymentCompleted,
        failure: {
          stage: "payment_executing",
          reasonCode: "payment.authoritative_no_transfer",
          failedAt: STAGE_TIMES[6],
          externalEffectAttempted: true,
          noValueMovedEvidence: paymentCompleted.evidence,
        },
      }, command, async (context) => {
        await context.paymentExecutions.compareAndSet(
          payRun.projectId, paymentPrepared.id, paymentPrepared.version, paymentPrepared.status, paymentCompleted,
        );
        await context.budgetReservations.compareAndSet(
          payRun.projectId, reservation.id, reservation.version, reservation.status, released,
        );
      });
      return this.result(payRun, released);
    }
    if (paymentCompleted.status !== "succeeded") {
      throw new InvariantViolationError("Sandbox payment adapter returned a non-authoritative result");
    }
    payRun = await this.transition(payRun, 6, "payment_succeeded", "payment.succeeded", {
      paymentExecution: paymentCompleted,
    }, command, async (context) => {
      await context.paymentExecutions.compareAndSet(
        payRun.projectId, paymentPrepared.id, paymentPrepared.version, paymentPrepared.status, paymentCompleted,
      );
    });

    const proofRequest = this.dependencies.prepareProofRequest(payRun, paymentCompleted, STAGE_TIMES[7]);
    payRun = await this.transition(payRun, 7, "proof_collecting", "proof.requested", {
      proofRequest,
    }, command);
    return this.completeFromProofCollecting(payRun, command, reservation);
  }

  private async completeFromProofCollecting(
    payRun: PayRun,
    command: ExecuteSandboxPayRunCommand,
    knownReservation?: BudgetReservation,
  ): Promise<SandboxControlLoopResult> {
    const proofRequest = payRun.proofRequest;
    const paymentCompleted = payRun.paymentExecution;
    if (!proofRequest || !paymentCompleted || paymentCompleted.status !== "succeeded") {
      throw new InvariantViolationError("proof_collecting recovery requires its successful Payment and Proof request");
    }
    const reservation = knownReservation ?? await this.dependencies.persistence.budgetReservations.get(
      payRun.projectId,
      `reservation_${payRun.id}`,
    );
    if (!reservation || reservation.status !== "active") {
      throw new InvariantViolationError("proof_collecting recovery requires one active BudgetReservation");
    }

    const proof = this.dependencies.collectProof(proofRequest, STAGE_TIMES[8]);
    payRun = await this.transition(payRun, 8, "proof_collected", "proof.verified", {
      executionProof: proof,
    }, command);

    const ledgerDraft = this.dependencies.buildLedgerDraft(paymentCompleted, proof, STAGE_TIMES[9]);
    payRun = await this.transition(payRun, 9, "ledger_recording", "ledger.prepared", {
      ledgerDraft,
    }, command);
    const journal = this.dependencies.commitLedger(ledgerDraft, STAGE_TIMES[10]);
    const consumed = consumeBudgetReservation(reservation, {
      expectedVersion: reservation.version,
      occurredAt: STAGE_TIMES[10],
      reasonCode: "ledger.committed",
      ledgerJournalId: journal.id,
    });
    payRun = await this.transition(payRun, 10, "completed", "ledger.committed", {
      ledgerJournal: journal,
    }, command, async (context) => {
      await context.ledger.append(payRun.projectId, journal);
      await context.budgetReservations.compareAndSet(
        payRun.projectId, reservation.id, reservation.version, reservation.status, consumed,
      );
    });
    return this.result(payRun, consumed);
  }

  private async create(
    command: ExecuteSandboxPayRunCommand,
    fixture: SandboxScenarioApplicationFixture,
    rootHash: string,
  ): Promise<PayRun> {
    const result = createPayRun({
      payRunId: fixture.intent.payRunId,
      projectId: fixture.project.id,
      environment: "sandbox",
      intent: fixture.intent,
      createdAt: STAGE_TIMES[0],
      creationIdempotencyKey: command.idempotencyKey,
      requestHash: rootHash,
      idempotencyRetentionUntil: IDEMPOTENCY_RETENTION,
      idempotencyRecordId: `idempotency_${fixture.intent.payRunId}_0`,
      auditEventId: `audit_${fixture.intent.payRunId}_1`,
      outboxEventId: `outbox_${fixture.intent.payRunId}_1`,
      correlationId: command.correlationId,
      actor: command.requester,
    });
    await this.dependencies.persistence.unitOfWork.execute(result.payRun.projectId, async (context) => {
      await context.payRuns.insert(result.payRun.projectId, result.payRun);
      await context.idempotency.insert(result.payRun.projectId, result.idempotencyRecord);
      await context.auditEvents.append(result.payRun.projectId, result.auditEvent);
      await context.domainOutbox.append(result.payRun.projectId, result.outboxEvent);
    });
    return result.payRun;
  }

  private async transition(
    current: PayRun,
    stage: number,
    to: PayRun["status"],
    reasonCode: string,
    data: PayRunTransitionData,
    root: ExecuteSandboxPayRunCommand,
    extension?: TransactionExtension,
  ): Promise<PayRun> {
    const key = `${root.idempotencyKey}:${stage}:${to}`;
    const result = transitionPayRun(current, {
      to,
      expectedVersion: current.version,
      occurredAt: STAGE_TIMES[stage],
      commandType: `sandbox_${to}`,
      idempotencyRecordId: `idempotency_${current.id}_${stage}`,
      idempotencyKey: key,
      requestHash: this.dependencies.hash({ payRunId: current.id, beforeVersion: current.version, to, reasonCode, data }),
      idempotencyRetentionUntil: IDEMPOTENCY_RETENTION,
      auditEventId: `audit_${current.id}_${current.lastAuditSequence + 1}`,
      outboxEventId: `outbox_${current.id}_${current.lastOutboxSequence + 1}`,
      correlationId: root.correlationId,
      actor: { actorId: "sandbox_control_loop", actorType: "system" },
      reasonCode,
      data,
    });
    await this.dependencies.persistence.unitOfWork.execute(current.projectId, async (context) => {
      await extension?.(context, result);
      await context.payRuns.compareAndSet(
        current.projectId, current.id, current.version, current.status, result.payRun,
      );
      await context.idempotency.insert(current.projectId, result.idempotencyRecord);
      await context.auditEvents.append(current.projectId, result.auditEvent);
      await context.domainOutbox.append(current.projectId, result.outboxEvent);
    });
    return result.payRun;
  }

  private buildPendingApproval(
    payRun: PayRun,
    decision: PolicyDecision,
    fixture: SandboxScenarioApplicationFixture,
    command: ExecuteSandboxPayRunCommand,
  ): Approval {
    const approvalScopeDigest = this.dependencies.hash({
      projectId: payRun.projectId,
      payRunId: payRun.id,
      agentId: payRun.intent.agentId,
      merchant: payRun.intent.merchant,
      purpose: payRun.intent.purpose,
      amountCeiling: payRun.intent.maximumAmount,
      amount: payRun.intent.quotedAmount,
      target: payRun.intent.settlementTarget,
      rail: fixture.policyRequest.rail,
      policy: decision.policySnapshot,
      fundingScopeDigest: fixture.fundingScopeDigest,
      coveredReasonCodes: decision.reasonCodes,
      expiresAt: payRun.intent.expiresAt,
    });
    const request = {
      id: `approval_request_${payRun.id}`,
      projectId: payRun.projectId,
      payRunId: payRun.id,
      payIntentId: payRun.intent.id,
      createdAt: STAGE_TIMES[2],
      expiresAt: payRun.intent.expiresAt,
      createdAtPayRunVersion: payRun.version,
      intentDigest: payRun.intentDigest,
      policyDecisionId: decision.id,
      policyId: decision.policyId,
      policyVersion: decision.policyVersion,
      policyChecksum: decision.policyChecksum,
      policyEvaluationDigest: decision.inputSnapshotDigest,
      agentId: payRun.intent.agentId,
      merchantId: payRun.intent.merchant.merchantId,
      purpose: payRun.intent.purpose,
      amount: payRun.intent.quotedAmount,
      amountCeiling: payRun.intent.maximumAmount,
      settlementTarget: payRun.intent.settlementTarget,
      rail: fixture.policyRequest.rail,
      fundingScopeDigest: fixture.fundingScopeDigest,
      coveredReasonCodes: decision.reasonCodes,
      approvalScopeDigest,
      generation: 1,
      requester: command.requester,
    } as const;
    return {
      id: `approval_${payRun.id}`,
      projectId: payRun.projectId,
      payRunId: payRun.id,
      version: 1,
      status: "pending",
      request,
      createdAt: STAGE_TIMES[2],
      updatedAt: STAGE_TIMES[2],
    };
  }

  private async result(payRun: PayRun, knownReservation?: BudgetReservation): Promise<SandboxControlLoopResult> {
    const reservation = knownReservation ?? await this.dependencies.persistence.budgetReservations.get(
      payRun.projectId,
      `reservation_${payRun.id}`,
    );
    const audit = await this.dependencies.persistence.auditEvents.list(payRun.projectId, payRun.id);
    const transitions = audit.map((event) => event.details.toStatus).filter(
      (status): status is PayRun["status"] => typeof status === "string",
    );
    const explanation = projectPayRunExplanation(payRun, reservation);
    return Object.freeze({
      payRun,
      reservation,
      transitions,
      explanation,
      validationReceipt: projectValidationReceipt(explanation),
    });
  }
}
