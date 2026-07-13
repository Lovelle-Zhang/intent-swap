import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { createDeterministicSandboxControlLoop, SANDBOX_PROJECT_ID } from "../adapters/sandbox";
import { openLocalJsonPayRunStorage } from "../adapters/storage";
import { parseStoreEnvelope } from "../adapters/storage/store-envelope";
import type { SandboxControlLoopResult } from "../application/control-loop";
import {
  PILOT_MANIFEST_FILE,
  PILOT_EXPECTED_STATUS,
  PILOT_SCENARIO_NAMES,
  PILOT_STORE_FILE,
  type PilotScenarioName,
  type PilotSessionManifest,
} from "./session-contracts";
import { PilotPublicationError } from "./session-errors";
import { createPilotCurrentPointer, createPilotSessionManifest } from "./session-schemas";
import { derivePilotSessionView } from "./session-projections";
import { publishPilotSessionDirectory, writeCanonicalJsonAtomically } from "./atomic-publication";

export interface PreparePilotSessionOptions {
  readonly repoRoot: string;
  readonly createdAt: string;
  readonly sourceCommit: string;
  readonly operationId: string;
  readonly afterScenario?: (name: PilotScenarioName) => Promise<void>;
}

export function createPilotSessionId(createdAt: string, sourceCommit: string): string {
  const timestamp = createdAt.replace(/[-:]/g, "");
  return `${timestamp}-${sourceCommit.slice(0, 7)}`;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function preparePilotSession(
  options: PreparePilotSessionOptions,
): Promise<PilotSessionManifest> {
  const sessionId = createPilotSessionId(options.createdAt, options.sourceCommit);
  const pilotRoot = join(options.repoRoot, ".zenfix-data", "pilot-validation");
  const sessionsRoot = join(pilotRoot, "sessions");
  const finalDirectory = join(sessionsRoot, sessionId);
  const temporaryDirectory = join(sessionsRoot, `.preparing-${sessionId}-${options.operationId}`);
  const storePath = join(temporaryDirectory, PILOT_STORE_FILE);
  let published = false;

  await mkdir(sessionsRoot, { recursive: true });
  if (await exists(finalDirectory)) throw new PilotPublicationError("Pilot Session already exists");
  try {
    await mkdir(temporaryDirectory);
    const storage = await openLocalJsonPayRunStorage({ storePath });
    const service = createDeterministicSandboxControlLoop(storage);
    const results: SandboxControlLoopResult[] = [];
    try {
      for (const name of PILOT_SCENARIO_NAMES) {
        results.push(await service.execute({
          projectId: SANDBOX_PROJECT_ID,
          scenarioId: name,
          idempotencyKey: `${sessionId}:${name}`,
          correlationId: `${sessionId}:${name}`,
          requester: { actorId: "sandbox_agent_owner", actorType: "agent" },
        }));
        await options.afterScenario?.(name);
      }
    } finally {
      await storage.close();
    }

    const envelope = parseStoreEnvelope(await readFile(storePath, "utf8"));
    const manifest = createPilotSessionManifest({
      schemaVersion: 1,
      sessionId,
      createdAt: options.createdAt,
      sourceCommit: options.sourceCommit,
      storeFile: PILOT_STORE_FILE,
      storeGeneration: envelope.storeGeneration,
      storeEnvelopeChecksum: envelope.envelopeChecksum,
      scenarios: PILOT_SCENARIO_NAMES.map((name, index) => ({
        name,
        payRunId: results[index]!.payRun.id,
        expectedFinalStatus: PILOT_EXPECTED_STATUS[name] as "completed" | "pending_review" | "blocked",
        actualFinalStatus: results[index]!.payRun.status as "completed" | "pending_review" | "blocked",
      })),
      preparationCommandVersion: "pv1-prepare-v1",
      sandboxOnly: true,
    });
    void derivePilotSessionView(manifest, envelope);
    await writeCanonicalJsonAtomically(
      join(temporaryDirectory, PILOT_MANIFEST_FILE),
      manifest,
      `${options.operationId}-manifest`,
    );
    if (await exists(finalDirectory)) throw new PilotPublicationError("Pilot Session already exists");
    await publishPilotSessionDirectory(temporaryDirectory, finalDirectory);
    published = true;
    const pointer = createPilotCurrentPointer({
      schemaVersion: 1,
      sessionId,
      manifestChecksum: manifest.manifestChecksum,
      updatedAt: options.createdAt,
    });
    await writeCanonicalJsonAtomically(join(pilotRoot, "current.json"), pointer, `${options.operationId}-current`);
    return manifest;
  } catch (error) {
    if (!published) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
