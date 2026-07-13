import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDeterministicSandboxControlLoop, SANDBOX_PROJECT_ID } from "@/features/payrun/adapters/sandbox";
import { openLocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import { parseStoreEnvelope, type LocalJsonStoreEnvelope } from "@/features/payrun/adapters/storage/store-envelope";
import { createPilotSessionManifest } from "@/features/payrun/pilot/session-schemas";
import { derivePilotSessionView } from "@/features/payrun/pilot/session-projections";
import { PilotScenarioMappingError } from "@/features/payrun/pilot/session-errors";
import type { PilotScenarioName, PilotSessionManifest } from "@/features/payrun/pilot/session-contracts";
import type { SandboxControlLoopResult } from "@/features/payrun/application/control-loop";

let root: string;
let envelope: LocalJsonStoreEnvelope;
let manifest: PilotSessionManifest;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zenfix-pilot-projection-"));
  const storePath = join(root, "payrun-store.json");
  const storage = await openLocalJsonPayRunStorage({ storePath });
  const service = createDeterministicSandboxControlLoop(storage);
  const names: readonly PilotScenarioName[] = ["allowed", "needs_review", "blocked", "funding_mismatch"];
  const results: SandboxControlLoopResult[] = [];
  for (const name of names) {
    results.push(await service.execute({
      projectId: SANDBOX_PROJECT_ID,
      scenarioId: name,
      idempotencyKey: `pilot:${name}`,
      correlationId: `pilot:${name}`,
      requester: { actorId: "sandbox_agent_owner", actorType: "agent" },
    }));
  }
  await storage.close();
  envelope = parseStoreEnvelope(await readFile(storePath, "utf8"));
  manifest = createPilotSessionManifest({
    schemaVersion: 1,
    sessionId: "20260714T001500.000Z-93ecba3",
    createdAt: "2026-07-14T00:15:00.000Z",
    sourceCommit: "93ecba37dcf5084360f33adde5e9a520d968bcb0",
    storeFile: "payrun-store.json",
    storeGeneration: envelope.storeGeneration,
    storeEnvelopeChecksum: envelope.envelopeChecksum,
    scenarios: names.map((name, index) => ({
      name,
      payRunId: results[index]!.payRun.id,
      expectedFinalStatus: results[index]!.payRun.status as "completed" | "pending_review" | "blocked",
      actualFinalStatus: results[index]!.payRun.status as "completed" | "pending_review" | "blocked",
    })),
    preparationCommandVersion: "pv1-prepare-v1",
    sandboxOnly: true,
  });
}, 20_000);

afterAll(async () => rm(root, { recursive: true, force: true }));

describe("PV-1 canonical projections", () => {
  it("derives all four immutable views from canonical Slice 4 records", () => {
    const view = derivePilotSessionView(manifest, envelope);

    expect(view.scenarios.map((scenario) => [scenario.name, scenario.actualFinalStatus])).toEqual([
      ["allowed", "completed"],
      ["needs_review", "pending_review"],
      ["blocked", "blocked"],
      ["funding_mismatch", "completed"],
    ]);
    expect(view.scenarios[0]).toMatchObject({
      funding: { status: "not_required" },
      ledger: { balanced: true },
      explanation: { amountAtomic: "420000", canonicalReceiptAvailable: false },
    });
    expect(view.scenarios[1]).toMatchObject({
      approval: { status: "pending" }, funding: null, payment: null, proof: null, ledger: null,
    });
    expect(view.scenarios[2]).toMatchObject({
      approval: null, funding: null, payment: null, proof: null, ledger: null,
      policy: { reasonCodes: expect.arrayContaining(["merchant.unknown"]) },
    });
    expect(view.scenarios[3]).toMatchObject({
      funding: { status: "sandbox_prepared", synthetic: true, transactionHash: null },
      explanation: { amountAtomic: "420000", realFundsMoved: false },
    });
    expect(view.watermark).toBe("SANDBOX / NO REAL FUNDS");
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.scenarios[0]!.audit)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("real settlement completed");
  });

  it("requires continuous Audit and Outbox lineage for every mapped PayRun", () => {
    const view = derivePilotSessionView(manifest, envelope);
    for (const scenario of view.scenarios) {
      expect(scenario.audit.map((event) => event.sequence)).toEqual(
        Array.from({ length: scenario.audit.length }, (_, index) => index + 1),
      );
      expect(scenario.audit.at(-1)?.afterVersion).toBe(
        envelope.payload.payRuns.find((payRun) => payRun.id === scenario.payRunId)!.version,
      );
    }
  });

  it("fails the complete load when manifest state does not match canonical state", () => {
    const changed = createPilotSessionManifest({
      ...manifest,
      scenarios: manifest.scenarios.map((scenario) => scenario.name === "allowed"
        ? { ...scenario, expectedFinalStatus: "blocked" as const, actualFinalStatus: "blocked" as const }
        : scenario),
    });
    expect(() => derivePilotSessionView(changed, envelope)).toThrow(PilotScenarioMappingError);
  });
});
