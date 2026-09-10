import { PersistenceUnavailableError } from "../adapters/storage";
import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import { AUDIT_GENESIS_HASH, hashAuditEntry } from "../adapters/storage/audit-hash";
import type { AuditEvent } from "../domain/types";
import { resolveApiKeyIdentity } from "./api-keys";
import { AuthUnavailableError } from "./errors";
import { retryOnTransientUnavailable } from "./retry";
import { resolvePersonalWorkspace, type VerifiedAuthIdentity } from "./workspace";

// Tamper-evident audit read side: return a Pay Run's audit events with their
// hash chain so anyone can independently re-derive it and confirm nothing was
// altered, inserted, or reordered. entry_hash = sha256(prev_hash + canonical
// content); prev_hash links to the previous event (genesis for the first).

export interface AuditChainEntry extends AuditEvent {
  readonly prevHash: string;
  readonly entryHash: string;
}
export interface AuditChain {
  readonly payRunId: string;
  readonly genesis: string;
  readonly headHash: string | null;
  readonly events: readonly AuditChainEntry[];
}

interface Row extends Record<string, unknown> {
  readonly id: string; readonly project_id: string; readonly pay_run_id: string;
  readonly sequence: number; readonly before_version: number; readonly after_version: number;
  readonly actor_id: string; readonly actor_type: AuditEvent["actor"]["actorType"];
  readonly action_code: string; readonly reason_code: string; readonly idempotency_key: string;
  readonly correlation_id: string; readonly occurred_at: string; readonly details: unknown;
  readonly prev_hash: string | null; readonly entry_hash: string | null;
}

function toEntry(row: Row): AuditChainEntry {
  return {
    id: row.id, projectId: row.project_id, payRunId: row.pay_run_id,
    aggregateType: "PayRun", aggregateId: row.pay_run_id, sequence: row.sequence,
    beforeVersion: row.before_version, afterVersion: row.after_version,
    actor: { actorId: row.actor_id, actorType: row.actor_type },
    actionCode: row.action_code, reasonCode: row.reason_code, idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id, occurredAt: new Date(row.occurred_at).toISOString(),
    details: row.details as AuditEvent["details"],
    prevHash: row.prev_hash ?? AUDIT_GENESIS_HASH, entryHash: row.entry_hash ?? "",
  };
}

export async function getWorkspaceAuditChain(
  pool: SqlPool, identity: VerifiedAuthIdentity, payRunId: string,
): Promise<AuditChain> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: workspace.projectId },
    async (client) => {
      const res = await client.query<Row>(
        `SELECT id, project_id, pay_run_id, sequence, before_version, after_version,
                actor_id, actor_type, action_code, reason_code, idempotency_key,
                correlation_id, occurred_at, details, prev_hash, entry_hash
           FROM public.audit_events
          WHERE project_id = $1::uuid AND pay_run_id = $2 ORDER BY sequence`,
        [workspace.projectId, payRunId],
      );
      const events = res.rows.map(toEntry);
      return {
        payRunId, genesis: AUDIT_GENESIS_HASH,
        headHash: events.length > 0 ? events[events.length - 1].entryHash : null,
        events,
      };
    },
  );
}

// Independent verification: re-derive the chain and confirm each stored hash. The
// same logic ships as a standalone verifier (examples/verify-audit).
export function verifyAuditChain(chain: AuditChain): { readonly ok: boolean; readonly brokenAt: number | null } {
  let prev = chain.genesis;
  for (let i = 0; i < chain.events.length; i++) {
    const e = chain.events[i];
    if (e.prevHash !== prev || hashAuditEntry(e.prevHash, e) !== e.entryHash) {
      return { ok: false, brokenAt: i };
    }
    prev = e.entryHash;
  }
  return { ok: true, brokenAt: null };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function bearer(request: Request): string | null {
  const m = /^Bearer (.+)$/.exec((request.headers.get("authorization") ?? "").trim());
  return m ? m[1] : null;
}

export async function handleAuditRequest(pool: SqlPool, request: Request, payRunId: string): Promise<Response> {
  const identity = await resolveApiKeyIdentity(pool, bearer(request));
  if (!identity) return json({ error: "Unauthorized" }, 401);
  try {
    const chain = await retryOnTransientUnavailable(() => getWorkspaceAuditChain(pool, identity, payRunId));
    if (chain.events.length === 0) return json({ error: "Pay Run not found" }, 404);
    return json(chain, 200);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
      return json({ error: "ZenFix is temporarily unavailable" }, 503);
    }
    throw error;
  }
}
