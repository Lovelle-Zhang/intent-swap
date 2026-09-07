import { sha256Canonical } from "../adapters/storage/canonical-json";
import type { PayRunPersistence } from "../application/ports";
import { InvariantViolationError } from "../domain/errors";
import { transitionPayRun } from "../domain/state-machine";
import type { Approval, ApprovalDecision, DomainActor, PayRun } from "../domain/types";
import type { VerifiedAuthIdentity } from "./workspace";

// needs_review human-approval loop. A signed-in workspace owner approves or
// denies a Pay Run that Policy routed to review. Approving authorizes it for
// execution (approved), denying is terminal (denied). ZenFix never executes or
// moves funds — this only records the human decision + audit trail.

export type ReviewAction = "approve" | "deny";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Build the decided Approval from the run's existing pending Approval. The
// request MUST be carried through byte-identical (immutability across the final
// decision); only version/status/updatedAt advance and a decision is attached.
function decide(
  current: PayRun,
  pending: Approval,
  action: ReviewAction,
  identity: VerifiedAuthIdentity,
  now: string,
): { approval: Approval; reasonCode: string } {
  const status = action === "approve" ? "approved" : "denied";
  const reasonCode = action === "approve" ? "review.approved" : "review.denied";
  const decision: ApprovalDecision = {
    id: `approval_decision_${current.id}`,
    projectId: current.projectId,
    approvalId: pending.id,
    payRunId: current.id,
    outcome: status,
    reviewerId: identity.userId,
    approver: { actorId: identity.userId, actorType: "user" },
    decidedAt: now,
    reasonCode,
    approvalScopeDigest: pending.request.approvalScopeDigest,
  };
  return {
    approval: {
      ...pending,
      version: pending.version + 1,
      status,
      updatedAt: now,
      decision,
    },
    reasonCode,
  };
}

export async function decideReview(
  persistence: PayRunPersistence,
  identity: VerifiedAuthIdentity,
  current: PayRun,
  action: ReviewAction,
  now: string,
): Promise<PayRun> {
  const pending = current.approval;
  if (!pending || pending.status !== "pending") {
    throw new InvariantViolationError("Review requires a pending Approval bound to the Pay Run");
  }
  // The persisted run's updatedAt may be ahead of wall clock (intake stamps its
  // transitions forward) and the state machine forbids moving time backwards, so
  // clamp the decision time to at least the current updatedAt.
  const at = new Date(Math.max(Date.parse(now), Date.parse(current.updatedAt))).toISOString();
  const retention = new Date(Date.parse(at) + YEAR_MS).toISOString();
  const { approval, reasonCode } = decide(current, pending, action, identity, at);
  const actor: DomainActor = { actorId: identity.userId, actorType: "user" };
  const result = transitionPayRun(current, {
    to: approval.status === "approved" ? "approved" : "denied",
    expectedVersion: current.version,
    occurredAt: at,
    commandType: `review_${approval.status}`,
    idempotencyRecordId: `idempotency_${current.id}_review`,
    idempotencyKey: `${current.creationIdempotencyKey}:review:${approval.status}`,
    requestHash: sha256Canonical({ payRunId: current.id, decision: approval.decision }),
    idempotencyRetentionUntil: retention,
    auditEventId: `audit_${current.id}_${current.lastAuditSequence + 1}`,
    outboxEventId: `outbox_${current.id}_${current.lastOutboxSequence + 1}`,
    correlationId: `review:${current.id}`,
    actor,
    reasonCode,
    data: { approval },
  });
  await persistence.unitOfWork.execute(current.projectId, async (context) => {
    await context.payRuns.compareAndSet(
      current.projectId, current.id, current.version, "pending_review", result.payRun,
    );
    await context.idempotency.insert(current.projectId, result.idempotencyRecord);
    await context.auditEvents.append(current.projectId, result.auditEvent);
    await context.domainOutbox.append(current.projectId, result.outboxEvent);
  });
  return result.payRun;
}
