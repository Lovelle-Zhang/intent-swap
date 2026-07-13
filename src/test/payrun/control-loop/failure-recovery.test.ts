import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openLocalJsonPayRunStorage, type LocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import {
  SANDBOX_PROJECT_ID,
  createDeterministicSandboxControlLoop,
} from "@/features/payrun/adapters/sandbox";
import { failSandboxPaymentWithoutTransfer } from "@/features/payrun/adapters/sandbox/payment";

const roots: string[] = [];
const handles: LocalJsonPayRunStorage[] = [];

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "zenfix-control-failure-"));
  roots.push(root);
  const storage = await openLocalJsonPayRunStorage({ storePath: join(root, "store.json") });
  handles.push(storage);
  return storage;
}

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const command = {
  projectId: SANDBOX_PROJECT_ID,
  scenarioId: "allowed" as const,
  idempotencyKey: "scenario:failure",
  correlationId: "correlation:failure",
  requester: { actorId: "sandbox_agent_owner", actorType: "agent" as const },
};

describe("Sandbox Control Loop failure recovery", () => {
  it("releases the reservation atomically on authoritative payment no-transfer failure", async () => {
    const storage = await harness();
    const service = createDeterministicSandboxControlLoop(storage, {
      completePayment: failSandboxPaymentWithoutTransfer,
    });

    const result = await service.execute(command);

    expect(result.payRun.status).toBe("failed");
    expect(result.payRun.paymentExecution?.status).toBe("failed_no_transfer");
    expect(result.reservation).toMatchObject({
      status: "released",
      terminalReasonCode: "payment.authoritative_no_transfer",
    });
    expect(result.payRun).not.toHaveProperty("proofRequest");
    expect(result.payRun).not.toHaveProperty("executionProof");
    expect(result.payRun).not.toHaveProperty("ledgerJournal");
  });

  it("leaves proof collecting durable and cannot complete when artifact collection fails", async () => {
    const storage = await harness();
    const service = createDeterministicSandboxControlLoop(storage, {
      collectProof() {
        throw new Error("sandbox artifact unavailable");
      },
    });

    await expect(service.execute(command)).rejects.toThrow("sandbox artifact unavailable");

    const [payRun] = await storage.payRuns.list(SANDBOX_PROJECT_ID);
    expect(payRun.status).toBe("proof_collecting");
    expect(payRun).not.toHaveProperty("executionProof");
    expect(payRun).not.toHaveProperty("ledgerDraft");
    expect(payRun).not.toHaveProperty("ledgerJournal");
    await expect(storage.budgetReservations.get(
      SANDBOX_PROJECT_ID,
      `reservation_${payRun.id}`,
    )).resolves.toMatchObject({ status: "active" });

    const resumed = await createDeterministicSandboxControlLoop(storage).execute(command);
    expect(resumed.payRun.status).toBe("completed");
    expect(resumed.reservation?.status).toBe("consumed");
    await expect(storage.auditEvents.list(SANDBOX_PROJECT_ID, payRun.id)).resolves.toHaveLength(11);
  });
});
