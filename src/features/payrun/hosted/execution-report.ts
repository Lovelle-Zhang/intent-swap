import { sha256Canonical } from "../adapters/storage/canonical-json";
import type { PayRunPersistence } from "../application/ports";
import { transitionPayRun } from "../domain/state-machine";
import type { DomainActor, ExecutionReport, PayRun } from "../domain/types";

// Execution-report input mapping + persistence. Kept apart from the HTTP handler
// so the request/response orchestration stays small. Building and committing an
// ExecutionReport runs the domain state machine (policy_allowed ->
// execution_reported) inside a single unit of work, mirroring intake-persist.

export interface ReportInput {
  readonly outcome: "executed" | "failed";
  readonly providerReference: string;
  readonly transactionHash: string | null;
  readonly rail: string;
  readonly artifactReference: string | null;
  readonly recipient: string | null; // claimed on-chain recipient (for base-sepolia verification)
  readonly idempotencyKey: string | null;
}

export function parseExecutionReportBody(body: unknown): ReportInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    (b.outcome !== "executed" && b.outcome !== "failed") ||
    typeof b.providerReference !== "string" || b.providerReference.length === 0 ||
    (b.transactionHash !== undefined && typeof b.transactionHash !== "string") ||
    (b.rail !== undefined && (typeof b.rail !== "string" || b.rail.length === 0)) ||
    (b.artifactReference !== undefined && typeof b.artifactReference !== "string") ||
    (b.recipient !== undefined && typeof b.recipient !== "string") ||
    (b.idempotencyKey !== undefined && typeof b.idempotencyKey !== "string")
  ) {
    return null;
  }
  return {
    outcome: b.outcome,
    providerReference: b.providerReference,
    transactionHash: typeof b.transactionHash === "string" ? b.transactionHash : null,
    rail: typeof b.rail === "string" ? b.rail : "base",
    artifactReference: typeof b.artifactReference === "string" ? b.artifactReference : null,
    recipient: typeof b.recipient === "string" && b.recipient.length > 0 ? b.recipient : null,
    idempotencyKey: typeof b.idempotencyKey === "string" && b.idempotencyKey.length > 0 ? b.idempotencyKey : null,
  };
}

export function buildExecutionReport(
  current: PayRun, projectId: string, input: ReportInput, now: string,
): ExecutionReport {
  return {
    id: `report_${current.id}`,
    projectId,
    payRunId: current.id,
    outcome: input.outcome,
    providerReference: input.providerReference,
    rail: input.rail,
    transactionHash: input.transactionHash,
    artifactReference: input.artifactReference,
    reportedAt: now,
    reportedBy: { actorId: current.intent.agentId || "api", actorType: "agent" },
  };
}

// Returns false when the compare-and-set loses (another writer already moved the
// run out of its authorized status — policy_allowed or approved). transitionPayRun
// throwing Terminal/VersionConflict is left to the caller to translate into 409.
export async function commitExecutionReport(
  persistence: PayRunPersistence, projectId: string, current: PayRun,
  report: ExecutionReport, idempotencyKey: string, now: string,
): Promise<boolean> {
  const retention = new Date(Date.parse(now) + 365 * 24 * 60 * 60 * 1000).toISOString();
  const actor: DomainActor = report.reportedBy;
  const result = transitionPayRun(current, {
    to: "execution_reported", expectedVersion: current.version, occurredAt: now,
    commandType: "execution_report", idempotencyRecordId: `idempotency_${current.id}_report`,
    idempotencyKey: `${idempotencyKey}:execution_reported`,
    requestHash: sha256Canonical({ payRunId: current.id, report }), idempotencyRetentionUntil: retention,
    auditEventId: `audit_${current.id}_${current.lastAuditSequence + 1}`,
    outboxEventId: `outbox_${current.id}_${current.lastOutboxSequence + 1}`,
    correlationId: `execution:${current.id}`, actor, reasonCode: "execution.reported",
    data: { executionReport: report },
  });
  return persistence.unitOfWork.execute(projectId, async (context) => {
    const cas = await context.payRuns.compareAndSet(
      projectId, current.id, current.version, current.status, result.payRun,
    );
    if (cas.kind === "conflict") return false;
    await context.idempotency.insert(projectId, result.idempotencyRecord);
    await context.auditEvents.append(projectId, result.auditEvent);
    await context.domainOutbox.append(projectId, result.outboxEvent);
    return true;
  });
}
