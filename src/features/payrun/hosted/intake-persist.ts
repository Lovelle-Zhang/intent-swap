import { sha256Canonical } from "../adapters/storage/canonical-json";
import { createPayRun, transitionPayRun } from "../domain/state-machine";
import type {
  Approval,
  CanonicalPolicyDecision,
  DomainActor,
  PayRun,
  PayRunStatus,
  PayRunTransitionData,
  PayRunTransitionResult,
} from "../domain/types";
import type { PayRunPersistence } from "../application/ports";
import type { IntakeEvaluation } from "./intake";

// 2B-intake persistence: write a decision-only PayRun and its audit trail. We
// run the domain state machine (create -> policy_evaluating -> outcome) exactly
// like control-loop.ts, committing each PayRunTransitionResult in its own unit
// of work. Legal targets only — this never advances into funding/payment.

const OUTCOME_STATUS: Record<CanonicalPolicyDecision["outcome"], PayRunStatus> = {
  allowed: "policy_allowed",
  needs_review: "pending_review",
  blocked: "blocked",
};

const ACTOR: DomainActor = { actorId: "zenfix_intake", actorType: "system" };

export async function persistIntakeDecision(
  persistence: PayRunPersistence,
  projectId: string,
  evaluation: IntakeEvaluation,
  idempotencyKey: string,
  now: string,
): Promise<PayRun> {
  const { payRunId, intent, decision } = evaluation;
  const base = Date.parse(now);
  const t1 = new Date(base + 1000).toISOString();
  const t2 = new Date(base + 2000).toISOString();
  const retention = new Date(base + 365 * 24 * 60 * 60 * 1000).toISOString();
  const correlationId = `intake:${payRunId}`;

  const created = createPayRun({
    payRunId, projectId, environment: "sandbox", intent, createdAt: now,
    creationIdempotencyKey: idempotencyKey,
    requestHash: sha256Canonical({ projectId, payRunId, intentDigest: intent.digest }),
    idempotencyRetentionUntil: retention,
    idempotencyRecordId: `idempotency_${payRunId}_0`,
    auditEventId: `audit_${payRunId}_1`,
    outboxEventId: `outbox_${payRunId}_1`,
    correlationId, actor: ACTOR,
  });
  await commit(persistence, projectId, created);

  const evaluating = transition(created.payRun, 1, "policy_evaluating", "policy.evaluating", {
    policyEvaluation: { id: `policy_eval_${payRunId}`, projectId, payRunId, attempt: 1, startedAt: t1 },
  }, t1, retention, correlationId);
  await commit(persistence, projectId, evaluating);

  const status = OUTCOME_STATUS[decision.outcome];
  const data: PayRunTransitionData = status === "pending_review"
    ? { policyDecision: decision, approval: buildPendingApproval(evaluating.payRun, evaluation, t2) }
    : { policyDecision: decision };
  const decided = transition(
    evaluating.payRun, 2, status, decision.reasonCodes[0] ?? "policy.decided", data, t2, retention, correlationId,
  );
  await commit(persistence, projectId, decided);
  return decided.payRun;
}

function transition(
  current: PayRun, stage: number, to: PayRunStatus, reasonCode: string,
  data: PayRunTransitionData, occurredAt: string, retention: string, correlationId: string,
): PayRunTransitionResult {
  return transitionPayRun(current, {
    to, expectedVersion: current.version, occurredAt, commandType: `intake_${to}`,
    idempotencyRecordId: `idempotency_${current.id}_${stage}`,
    idempotencyKey: `${current.creationIdempotencyKey}:${stage}:${to}`,
    requestHash: sha256Canonical({ payRunId: current.id, to, reasonCode, stage }),
    idempotencyRetentionUntil: retention,
    auditEventId: `audit_${current.id}_${current.lastAuditSequence + 1}`,
    outboxEventId: `outbox_${current.id}_${current.lastOutboxSequence + 1}`,
    correlationId, actor: ACTOR, reasonCode, data,
  });
}

async function commit(
  persistence: PayRunPersistence, projectId: string, result: PayRunTransitionResult,
): Promise<void> {
  await persistence.unitOfWork.execute(projectId, async (context) => {
    if (result.payRun.version === 1) {
      await context.payRuns.insert(projectId, result.payRun);
    } else {
      await context.payRuns.compareAndSet(
        projectId, result.payRun.id, result.payRun.version - 1,
        result.auditEvent.details.fromStatus as PayRunStatus, result.payRun,
      );
    }
    await context.idempotency.insert(projectId, result.idempotencyRecord);
    await context.auditEvents.append(projectId, result.auditEvent);
    await context.domainOutbox.append(projectId, result.outboxEvent);
  });
}

function buildPendingApproval(payRun: PayRun, evaluation: IntakeEvaluation, createdAt: string): Approval {
  const decision = evaluation.decision;
  const approvalScopeDigest = sha256Canonical({
    payRunId: payRun.id, policy: decision.policySnapshot,
    coveredReasonCodes: decision.reasonCodes, fundingScopeDigest: evaluation.fundingScopeDigest,
  });
  return {
    id: `approval_${payRun.id}`, projectId: payRun.projectId, payRunId: payRun.id,
    version: 1, status: "pending", createdAt, updatedAt: createdAt,
    request: {
      id: `approval_request_${payRun.id}`, projectId: payRun.projectId, payRunId: payRun.id,
      payIntentId: payRun.intent.id, createdAt, expiresAt: payRun.intent.expiresAt,
      createdAtPayRunVersion: payRun.version, intentDigest: payRun.intentDigest,
      policyDecisionId: decision.id, policyId: decision.policyId, policyVersion: decision.policyVersion,
      policyChecksum: decision.policyChecksum, policyEvaluationDigest: decision.inputSnapshotDigest,
      agentId: payRun.intent.agentId, merchantId: payRun.intent.merchant.merchantId,
      purpose: payRun.intent.purpose, amount: payRun.intent.quotedAmount,
      amountCeiling: payRun.intent.maximumAmount, settlementTarget: payRun.intent.settlementTarget,
      rail: evaluation.rail, fundingScopeDigest: evaluation.fundingScopeDigest,
      coveredReasonCodes: decision.reasonCodes, approvalScopeDigest, generation: 1,
      requester: { actorId: payRun.intent.agentId, actorType: "agent" },
    },
  };
}
