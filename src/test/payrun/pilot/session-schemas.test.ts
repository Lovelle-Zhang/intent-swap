import { describe, expect, it } from "vitest";

import {
  createPilotCurrentPointer,
  createPilotSessionManifest,
  parsePilotCurrentPointer,
  parsePilotSessionManifest,
} from "@/features/payrun/pilot/session-schemas";
import { PilotManifestValidationError } from "@/features/payrun/pilot/session-errors";

const sessionId = "20260714T001500.000Z-93ecba3";

const manifestContent = () => ({
  schemaVersion: 1 as const,
  sessionId,
  createdAt: "2026-07-14T00:15:00.000Z",
  sourceCommit: "93ecba37dcf5084360f33adde5e9a520d968bcb0",
  storeFile: "payrun-store.json" as const,
  storeGeneration: 28,
  storeEnvelopeChecksum: "a".repeat(64),
  scenarios: [
    { name: "allowed" as const, payRunId: "payrun_allowed", expectedFinalStatus: "completed" as const, actualFinalStatus: "completed" as const },
    { name: "needs_review" as const, payRunId: "payrun_review", expectedFinalStatus: "pending_review" as const, actualFinalStatus: "pending_review" as const },
    { name: "blocked" as const, payRunId: "payrun_blocked", expectedFinalStatus: "blocked" as const, actualFinalStatus: "blocked" as const },
    { name: "funding_mismatch" as const, payRunId: "payrun_mismatch", expectedFinalStatus: "completed" as const, actualFinalStatus: "completed" as const },
  ] as const,
  preparationCommandVersion: "pv1-prepare-v1" as const,
  sandboxOnly: true as const,
});

describe("PV-1 Pilot Session schemas", () => {
  it("round-trips a canonical checksummed manifest", () => {
    const manifest = createPilotSessionManifest(manifestContent());
    expect(parsePilotSessionManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(manifest.manifestChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects tampering and unexpected fields", () => {
    const manifest = createPilotSessionManifest(manifestContent());
    expect(() => parsePilotSessionManifest(JSON.stringify({ ...manifest, storeGeneration: 29 })))
      .toThrow(PilotManifestValidationError);
    expect(() => parsePilotSessionManifest(JSON.stringify({ ...manifest, secret: "no" })))
      .toThrow(PilotManifestValidationError);
  });

  it("requires the frozen scenario order and unique PayRun mapping", () => {
    const content = manifestContent();
    expect(() => createPilotSessionManifest({
      ...content,
      scenarios: [content.scenarios[1], content.scenarios[0], content.scenarios[2], content.scenarios[3]],
    })).toThrow(PilotManifestValidationError);
    expect(() => createPilotSessionManifest({
      ...content,
      scenarios: content.scenarios.map((scenario, index) => ({
        ...scenario,
        payRunId: index === 3 ? content.scenarios[0].payRunId : scenario.payRunId,
      })) as unknown as typeof content.scenarios,
    })).toThrow(PilotManifestValidationError);
  });

  it("binds the session id timestamp to the source commit prefix", () => {
    expect(() => createPilotSessionManifest({ ...manifestContent(), sessionId: "../escape" }))
      .toThrow(PilotManifestValidationError);
    expect(() => createPilotSessionManifest({
      ...manifestContent(),
      sessionId: "20260714T001500.000Z-deadbee",
    })).toThrow(PilotManifestValidationError);
  });

  it("round-trips and detects tampering of the current pointer", () => {
    const manifest = createPilotSessionManifest(manifestContent());
    const pointer = createPilotCurrentPointer({
      schemaVersion: 1,
      sessionId,
      manifestChecksum: manifest.manifestChecksum,
      updatedAt: "2026-07-14T00:16:00.000Z",
    });
    expect(parsePilotCurrentPointer(JSON.stringify(pointer))).toEqual(pointer);
    expect(() => parsePilotCurrentPointer(JSON.stringify({ ...pointer, sessionId: "../bad" })))
      .toThrow(PilotManifestValidationError);
  });
});
