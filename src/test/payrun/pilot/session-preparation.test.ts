import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { preparePilotSession } from "@/features/payrun/pilot/session-preparation";
import { parsePilotCurrentPointer, parsePilotSessionManifest } from "@/features/payrun/pilot/session-schemas";
import { parseStoreEnvelope } from "@/features/payrun/adapters/storage/store-envelope";
import { PilotPublicationError } from "@/features/payrun/pilot/session-errors";

const roots: string[] = [];
const createdAt = "2026-07-14T00:15:00.000Z";
const sourceCommit = "93ecba37dcf5084360f33adde5e9a520d968bcb0";
const sessionId = "20260714T001500.000Z-93ecba3";

async function root() {
  const value = await mkdtemp(join(tmpdir(), "zenfix-pilot-prepare-"));
  roots.push(value);
  return value;
}

afterEach(async () => Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))));

describe("PV-1 Pilot Session preparation", () => {
  it("runs the real Slice 4 Control Loop and atomically publishes four canonical scenarios", async () => {
    const repoRoot = await root();
    const manifest = await preparePilotSession({ repoRoot, createdAt, sourceCommit, operationId: "op-1" });
    const pilotRoot = join(repoRoot, ".zenfix-data", "pilot-validation");
    const sessionRoot = join(pilotRoot, "sessions", sessionId);
    const storedManifest = parsePilotSessionManifest(await readFile(join(sessionRoot, "pilot-session-manifest.json"), "utf8"));
    const envelope = parseStoreEnvelope(await readFile(join(sessionRoot, "payrun-store.json"), "utf8"));
    const pointer = parsePilotCurrentPointer(await readFile(join(pilotRoot, "current.json"), "utf8"));

    expect(manifest).toEqual(storedManifest);
    expect(pointer).toMatchObject({ sessionId, manifestChecksum: manifest.manifestChecksum });
    expect(envelope.payload.payRuns).toHaveLength(4);
    expect(envelope.storeGeneration).toBe(28);
    expect(manifest.scenarios.map((scenario) => [scenario.name, scenario.actualFinalStatus])).toEqual([
      ["allowed", "completed"], ["needs_review", "pending_review"],
      ["blocked", "blocked"], ["funding_mismatch", "completed"],
    ]);
    await expect(stat(`${join(sessionRoot, "payrun-store.json")}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("does not publish or advance current when any scenario preparation fails", async () => {
    const repoRoot = await root();
    const pilotRoot = join(repoRoot, ".zenfix-data", "pilot-validation");

    await expect(preparePilotSession({
      repoRoot,
      createdAt,
      sourceCommit,
      operationId: "op-fail",
      async afterScenario(name) {
        if (name === "needs_review") throw new Error("injected scenario failure");
      },
    })).rejects.toThrow("injected scenario failure");

    await expect(stat(join(pilotRoot, "sessions", sessionId))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(pilotRoot, "current.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never overwrites an existing immutable session", async () => {
    const repoRoot = await root();
    const first = await preparePilotSession({ repoRoot, createdAt, sourceCommit, operationId: "op-1" });
    const pointerPath = join(repoRoot, ".zenfix-data", "pilot-validation", "current.json");
    const before = await readFile(pointerPath, "utf8");

    await expect(preparePilotSession({ repoRoot, createdAt, sourceCommit, operationId: "op-2" }))
      .rejects.toBeInstanceOf(PilotPublicationError);
    expect(await readFile(pointerPath, "utf8")).toBe(before);
    expect(parsePilotCurrentPointer(before).manifestChecksum).toBe(first.manifestChecksum);
  }, 30_000);
});
