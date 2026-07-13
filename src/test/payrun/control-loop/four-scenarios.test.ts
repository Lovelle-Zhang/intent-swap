import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openLocalJsonPayRunStorage, type LocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import {
  SANDBOX_PROJECT_ID,
  createDeterministicSandboxControlLoop,
} from "@/features/payrun/adapters/sandbox";

const roots: string[] = [];
const handles: LocalJsonPayRunStorage[] = [];

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "zenfix-control-loop-"));
  roots.push(root);
  const storage = await openLocalJsonPayRunStorage({ storePath: join(root, "store.json") });
  handles.push(storage);
  return { storage, service: createDeterministicSandboxControlLoop(storage) };
}

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const execute = (service: ReturnType<typeof createDeterministicSandboxControlLoop>, scenarioId: "allowed" | "needs_review" | "blocked" | "funding_mismatch") =>
  service.execute({
    projectId: SANDBOX_PROJECT_ID,
    scenarioId,
    idempotencyKey: `scenario:${scenarioId}`,
    correlationId: `correlation:${scenarioId}`,
    requester: { actorId: "sandbox_agent_owner", actorType: "agent" },
  });

describe("Slice 4 deterministic Sandbox Control Loop", () => {
  it("completes Allowed with not_required Funding, consumed reservation, Proof, Ledger, Audit, and Outbox", async () => {
    const { storage, service } = await harness();
    const result = await execute(service, "allowed");

    expect(result.payRun.status).toBe("completed");
    expect(result.transitions).toEqual([
      "intent_recorded", "policy_evaluating", "policy_allowed", "funding_preparing",
      "funding_prepared", "payment_executing", "payment_succeeded", "proof_collecting",
      "proof_collected", "ledger_recording", "completed",
    ]);
    expect(result.payRun.fundingPreparation?.status).toBe("not_required");
    expect(result.payRun.fundingPreparation?.action).toBe("none");
    expect(result.payRun.paymentExecution?.status).toBe("succeeded");
    expect(result.payRun.executionProof?.verificationStatus).toBe("verified");
    expect(result.payRun.ledgerJournal).toBeDefined();
    expect(result.reservation?.status).toBe("consumed");
    expect(result.explanation).toMatchObject({
      canonicalStatus: "completed",
      canonicalReceiptAvailable: false,
      realFundsMoved: false,
      watermark: "SANDBOX / NO REAL FUNDS",
    });
    await expect(storage.auditEvents.list(SANDBOX_PROJECT_ID, result.payRun.id)).resolves.toHaveLength(11);
    expect(result.payRun.lastOutboxSequence).toBe(11);
  });

  it("stops Needs Review with an ApprovalRequest and no downstream records", async () => {
    const { storage, service } = await harness();
    const result = await execute(service, "needs_review");

    expect(result.payRun.status).toBe("pending_review");
    expect(result.transitions).toEqual(["intent_recorded", "policy_evaluating", "pending_review"]);
    expect(result.payRun.approval?.status).toBe("pending");
    expect(result.reservation).toBeNull();
    expect(result.payRun).not.toHaveProperty("fundingPreparation");
    expect(result.payRun).not.toHaveProperty("paymentExecution");
    expect(result.payRun).not.toHaveProperty("executionProof");
    expect(result.payRun).not.toHaveProperty("ledgerJournal");
    await expect(storage.budgetReservations.listActive(SANDBOX_PROJECT_ID, [])).resolves.toEqual([]);
    expect(result.explanation.nextAction).toBe("human_review_required");
  });

  it("stops Blocked on an existing unknown Merchant with no Approval or downstream records", async () => {
    const { service } = await harness();
    const result = await execute(service, "blocked");

    expect(result.payRun.status).toBe("blocked");
    expect(result.transitions).toEqual(["intent_recorded", "policy_evaluating", "blocked"]);
    expect(result.payRun.policyDecisions.at(-1)?.reasonCodes).toContain("merchant.unknown");
    expect(result.payRun).not.toHaveProperty("approval");
    expect(result.reservation).toBeNull();
    expect(result.payRun).not.toHaveProperty("fundingPreparation");
    expect(result.payRun).not.toHaveProperty("paymentExecution");
    expect(result.payRun).not.toHaveProperty("executionProof");
    expect(result.payRun).not.toHaveProperty("ledgerJournal");
  });

  it("completes Funding Mismatch with sandbox_prepared simulation and no real-chain claim", async () => {
    const { service } = await harness();
    const result = await execute(service, "funding_mismatch");

    expect(result.payRun.status).toBe("completed");
    expect(result.payRun.intent.quotedAmount.amountAtomic).toBe("420000");
    expect(result.payRun.intent.requestedFundingSource).toMatchObject({ chainFamily: "ethereum", asset: "ETH" });
    expect(result.payRun.fundingPreparation).toMatchObject({
      status: "sandbox_prepared",
      action: "swap_and_bridge",
      transactionHash: null,
      realFundsAvailable: false,
      realBridgeCapability: false,
    });
    expect(result.payRun.fundingPreparation?.route.every((step) => step.simulated)).toBe(true);
    expect(result.reservation?.status).toBe("consumed");
    expect(result.explanation.funding.displayLabel).toBe("Simulation completed");
    expect(JSON.stringify(result)).not.toContain("real settlement completed");
  });

  it("replays the same root command without another store generation", async () => {
    const { storage, service } = await harness();
    const first = await execute(service, "allowed");
    const generation = await storage.getStoreGeneration();
    const replay = await execute(service, "allowed");

    expect(replay.payRun).toEqual(first.payRun);
    await expect(storage.getStoreGeneration()).resolves.toBe(generation);
  });
});
