import { createHash } from "node:crypto";

import type { AuditEvent } from "../../domain/types";
import { canonicalStringify } from "./canonical-json";

// Hash-chain primitive for the audit trail. entry_hash =
// sha256(prev_hash + "\n" + canonical(content)); the first event chains from
// AUDIT_GENESIS_HASH. Content is a fixed projection of the event's stable fields
// with occurredAt normalised to a millisecond ISO string so it round-trips
// identically through Postgres — anyone with the returned fields can re-derive
// the exact hash. This lives in the storage adapter layer so both the write path
// and read-side verification share ONE definition.

export const AUDIT_GENESIS_HASH = "0".repeat(64);

// The exact, reproducible preimage content for one event (excludes the hashes).
export function auditEntryContent(event: AuditEvent): Record<string, unknown> {
  return {
    id: event.id,
    projectId: event.projectId,
    payRunId: event.payRunId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    sequence: event.sequence,
    beforeVersion: event.beforeVersion,
    afterVersion: event.afterVersion,
    actor: { actorId: event.actor.actorId, actorType: event.actor.actorType },
    actionCode: event.actionCode,
    reasonCode: event.reasonCode,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    occurredAt: new Date(event.occurredAt).toISOString(),
    details: event.details,
  };
}

export function hashAuditEntry(prevHash: string, event: AuditEvent): string {
  const preimage = `${prevHash}\n${canonicalStringify(auditEntryContent(event))}`;
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}
