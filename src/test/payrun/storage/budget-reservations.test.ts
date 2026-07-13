import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openLocalJsonPayRunStorage, type LocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import { activateBudgetReservation, consumeBudgetReservation } from "@/features/payrun/domain/budget-reservation";
import { VersionConflictError } from "@/features/payrun/domain/errors";
import type { BudgetReservation } from "@/features/payrun/domain/types";
import { EXPIRES_AT, OTHER_PROJECT_ID, PAY_RUN_ID, PROJECT_ID, UPDATED_AT, money } from "@/test/payrun/domain/fixtures";

const roots: string[] = [];
const handles: LocalJsonPayRunStorage[] = [];

function reservation(id = "reservation_001", scopeGeneration = 1): BudgetReservation {
  return activateBudgetReservation({
    id,
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    agentId: "agent_001",
    merchantId: "merchant_known",
    rail: "sandbox",
    scopeGeneration,
    policyDecisionId: "decision_allowed_001",
    policyId: "policy_001",
    policyVersion: 1,
    policyChecksum: "sha256:policy:001",
    policyEvaluationDigest: "sha256:input:allowed",
    intentDigest: "sha256:intent:001",
    approvalScopeDigest: null,
    approvalDecisionId: null,
    fundingScopeDigest: "sha256:funding-scope:001",
    budgetKeys: ["project:project_zenfix_test", "agent:agent_001", "merchant:merchant_known"],
    reservedAmount: money("420000"),
    environment: "sandbox",
    expiresAt: EXPIRES_AT,
    terminalReasonCode: null,
    terminalEvidence: null,
  }, UPDATED_AT);
}

async function openStore(): Promise<LocalJsonPayRunStorage> {
  const root = await mkdtemp(join(tmpdir(), "zenfix-reservations-"));
  roots.push(root);
  const storage = await openLocalJsonPayRunStorage({ storePath: join(root, "store.json") });
  handles.push(storage);
  return storage;
}

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("BudgetReservation persistence", () => {
  it("persists, restarts, and isolates active reservations by Project", async () => {
    const storage = await openStore();
    const active = reservation();
    await storage.budgetReservations.insert(PROJECT_ID, active);

    await expect(storage.budgetReservations.get(PROJECT_ID, active.id)).resolves.toEqual(active);
    await expect(storage.budgetReservations.listActive(PROJECT_ID, active.budgetKeys)).resolves.toEqual([active]);
    await expect(storage.budgetReservations.get(OTHER_PROJECT_ID, active.id)).resolves.toBeNull();

    const path = storage.canonicalStorePath;
    await storage.close();
    const restarted = await openLocalJsonPayRunStorage({ storePath: path });
    handles.push(restarted);
    await expect(restarted.budgetReservations.get(PROJECT_ID, active.id)).resolves.toEqual(active);
  });

  it("prevents duplicate scope generation and stale CAS", async () => {
    const storage = await openStore();
    const active = reservation();
    await storage.budgetReservations.insert(PROJECT_ID, active);
    await expect(storage.budgetReservations.insert(PROJECT_ID, reservation("reservation_002")))
      .rejects.toMatchObject({ code: "duplicate_storage_record" });

    const consumed = consumeBudgetReservation(active, {
      expectedVersion: 1,
      occurredAt: "2026-07-12T00:04:00.000Z",
      reasonCode: "ledger.committed",
      ledgerJournalId: "journal_001",
    });
    await expect(storage.budgetReservations.compareAndSet(PROJECT_ID, active.id, 0, "active", consumed))
      .rejects.toBeInstanceOf(VersionConflictError);
    await expect(storage.budgetReservations.compareAndSet(PROJECT_ID, active.id, 1, "active", consumed))
      .resolves.toMatchObject({ kind: "updated" });
  });
});
