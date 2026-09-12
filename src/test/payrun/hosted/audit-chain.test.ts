import { describe, expect, test } from "vitest";

import { AUDIT_GENESIS_HASH, hashAuditEntry } from "@/features/payrun/adapters/storage/audit-hash";
import { verifyAuditChain, type AuditChain, type AuditChainEntry } from "@/features/payrun/hosted/audit-chain";
import type { AuditEvent } from "@/features/payrun/domain/types";

function event(seq: number, actionCode: string): AuditEvent {
  return {
    id: `audit_run_${seq}`, projectId: "11111111-1111-4111-8111-111111111111", payRunId: "run",
    aggregateType: "PayRun", aggregateId: "run", sequence: seq,
    beforeVersion: seq - 1, afterVersion: seq,
    actor: { actorId: "agent_1", actorType: "agent" },
    actionCode, reasonCode: "x.reason", idempotencyKey: `idem_${seq}`, correlationId: "corr",
    occurredAt: `2026-09-10T00:00:0${seq}.000Z`, details: { n: seq },
  };
}

// Build a well-formed chain by hashing each event off the previous, exactly as
// the storage adapter does.
function chainOf(events: AuditEvent[]): AuditChain {
  const out: AuditChainEntry[] = [];
  let prev = AUDIT_GENESIS_HASH;
  for (const e of events) {
    const entryHash = hashAuditEntry(prev, e);
    out.push({ ...e, prevHash: prev, entryHash });
    prev = entryHash;
  }
  return { payRunId: "run", genesis: AUDIT_GENESIS_HASH, headHash: prev, events: out };
}

describe("verifyAuditChain", () => {
  const chain = chainOf([event(1, "payrun.created"), event(2, "payrun.transition"), event(3, "execution.reported")]);

  test("a well-formed chain verifies", () => {
    expect(verifyAuditChain(chain)).toEqual({ ok: true, brokenAt: null });
    expect(chain.headHash).toBe(chain.events[2].entryHash);
  });

  test("altering an event's content breaks its hash", () => {
    const tampered: AuditChain = {
      ...chain,
      events: chain.events.map((e, i) => (i === 1 ? { ...e, reasonCode: "changed" } : e)),
    };
    expect(verifyAuditChain(tampered)).toEqual({ ok: false, brokenAt: 1 });
  });

  test("reordering / breaking the prev link is detected", () => {
    const swapped: AuditChain = { ...chain, events: [chain.events[0], chain.events[2], chain.events[1]] };
    expect(verifyAuditChain(swapped).ok).toBe(false);
  });

  test("a dropped event breaks the chain (prev link no longer matches)", () => {
    const dropped: AuditChain = { ...chain, events: [chain.events[0], chain.events[2]] };
    expect(verifyAuditChain(dropped)).toEqual({ ok: false, brokenAt: 1 });
  });
});
