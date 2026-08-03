import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { NextResponse } from "next/server";

import {
  createDeterministicSandboxControlLoop,
  SANDBOX_PROJECT_ID,
} from "@/features/payrun/adapters/sandbox";
import { openLocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import {
  SANDBOX_SCENARIO_IDS,
  type SandboxScenarioId,
} from "@/features/payrun/application/control-loop-commands";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Each submission is one live run, written to its own fresh store directory —
// mirroring pilot/session-preparation.ts (one store per preparation run). This
// avoids writer-lease contention and PayRun id collisions, and proves the run
// actually hit disk. `.zenfix-data/` is already git-ignored.
const LIVE_RUNS_DIR = ".zenfix-data/live-runs";

function isScenarioId(value: unknown): value is SandboxScenarioId {
  return typeof value === "string" && (SANDBOX_SCENARIO_IDS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const scenarioId = (body as { readonly scenarioId?: unknown })?.scenarioId;
  if (!isScenarioId(scenarioId)) {
    return NextResponse.json(
      { error: `scenarioId must be one of: ${SANDBOX_SCENARIO_IDS.join(", ")}` },
      { status: 400 },
    );
  }

  const runId = randomUUID();
  const relativeStorePath = `${LIVE_RUNS_DIR}/${runId}/payrun-store.json`;
  const storeDir = join(process.cwd(), LIVE_RUNS_DIR, runId);
  const storePath = join(storeDir, "payrun-store.json");
  const startedAt = new Date().toISOString();

  await mkdir(storeDir, { recursive: true });
  const storage = await openLocalJsonPayRunStorage({ storePath });
  const executionStart = performance.now();
  let result;
  try {
    const service = createDeterministicSandboxControlLoop(storage);
    result = await service.execute({
      projectId: SANDBOX_PROJECT_ID,
      scenarioId,
      idempotencyKey: `live:${runId}`,
      correlationId: `live:${runId}`,
      requester: { actorId: "sandbox_agent_owner", actorType: "agent" },
    });
  } finally {
    await storage.close();
  }
  const controlLoopDurationMs = Math.round((performance.now() - executionStart) * 1000) / 1000;

  return NextResponse.json({
    runId,
    scenarioId,
    startedAt,
    controlLoopDurationMs,
    storePath: relativeStorePath,
    payRunId: result.payRun.id,
    status: result.payRun.status,
    policyOutcome: result.explanation.policy.outcome,
    reasonCodes: result.explanation.policy.reasonCodes,
    transitions: result.transitions,
    warning: "SANDBOX / NO REAL FUNDS",
  });
}
