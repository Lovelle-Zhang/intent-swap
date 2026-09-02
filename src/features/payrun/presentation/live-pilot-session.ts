import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { createDeterministicSandboxControlLoop, SANDBOX_PROJECT_ID } from "../adapters/sandbox";
import { openLocalJsonPayRunStorage } from "../adapters/storage";
import { parseStoreEnvelope } from "../adapters/storage/store-envelope";
import type { SandboxControlLoopResult } from "../application/control-loop";
import {
  PILOT_EXPECTED_STATUS,
  PILOT_SCENARIO_NAMES,
  PILOT_STORE_FILE,
  type PilotSessionView,
} from "../pilot/session-contracts";
import { derivePilotSessionView } from "../pilot/session-projections";
import { createPilotSessionId } from "../pilot/session-preparation";
import { createPilotSessionManifest } from "../pilot/session-schemas";

// A1: the Command Center renders a PilotSessionView. Instead of reading the
// committed pre-baked snapshot (.zenfix-data/pilot-validation/current.json),
// this builds that same view LIVE at request time — running the real Slice-4
// control loop over the four pilot scenarios into a throwaway, git-ignored
// store, then reusing the exact offline projection (derivePilotSessionView).
// It never touches the committed pilot directory, so the offline pilot:prepare
// path and its snapshot are unaffected.
//
// Server-only in practice (node:child_process + fs); the `.server.ts` sibling
// carries the `server-only` guard for imports while this core stays unit-testable.
const LIVE_RUNS_DIR = ".zenfix-data/live-runs";

// createPilotSessionManifest requires a full 40-hex Git SHA (it binds the
// session id's git suffix to it). Use the real HEAD commit so a live run is
// traceable to the code that produced it; fall back to a valid placeholder
// when git is unavailable (e.g. a deployment without a .git directory).
function resolveSourceCommit(): string {
  try {
    const sha = execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : "0".repeat(40);
  } catch {
    return "0".repeat(40);
  }
}

export async function buildLivePilotSession(): Promise<PilotSessionView> {
  const createdAt = new Date().toISOString();
  const sourceCommit = resolveSourceCommit();
  const sessionId = createPilotSessionId(createdAt, sourceCommit);

  const runDir = join(process.cwd(), LIVE_RUNS_DIR, randomUUID());
  const storePath = join(runDir, PILOT_STORE_FILE);
  await mkdir(runDir, { recursive: true });

  try {
    const storage = await openLocalJsonPayRunStorage({ storePath });
    const service = createDeterministicSandboxControlLoop(storage);
    const results: SandboxControlLoopResult[] = [];
    try {
      for (const name of PILOT_SCENARIO_NAMES) {
        results.push(
          await service.execute({
            projectId: SANDBOX_PROJECT_ID,
            scenarioId: name,
            idempotencyKey: `${sessionId}:${name}`,
            correlationId: `${sessionId}:${name}`,
            requester: { actorId: "sandbox_agent_owner", actorType: "agent" },
          }),
        );
      }
    } finally {
      await storage.close();
    }

    const envelope = parseStoreEnvelope(await readFile(storePath, "utf8"));
    const manifest = createPilotSessionManifest({
      schemaVersion: 1,
      sessionId,
      createdAt,
      sourceCommit,
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
    return derivePilotSessionView(manifest, envelope);
  } finally {
    // Best-effort cleanup: the store was only a scratch surface for this render.
    await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
