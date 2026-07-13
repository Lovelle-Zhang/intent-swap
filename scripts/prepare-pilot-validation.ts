import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";

import { preparePilotSession } from "../src/features/payrun/pilot/session-preparation";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const repoRoot = git("rev-parse", "--show-toplevel");
  if (repoRoot !== process.cwd()) throw new Error("Run pilot:prepare from the repository root");
  const targetRoot = process.env.ZENFIX_PILOT_REPO_ROOT ?? repoRoot;
  const isolatedTestPreparation = targetRoot !== repoRoot && process.env.NODE_ENV === "test";
  if (!isAbsolute(targetRoot)) throw new Error("Pilot preparation root must be absolute");
  if (targetRoot !== repoRoot && !isolatedTestPreparation) {
    throw new Error("An alternate Pilot preparation root is allowed only for isolated tests");
  }
  if (!isolatedTestPreparation && git("status", "--porcelain").length !== 0) {
    throw new Error("Pilot preparation requires a clean Git worktree");
  }
  const sourceCommit = git("rev-parse", "HEAD");
  const createdAt = new Date().toISOString();
  const manifest = await preparePilotSession({
    repoRoot: targetRoot,
    createdAt,
    sourceCommit,
    operationId: randomUUID(),
  });
  process.stdout.write(`${JSON.stringify({
    sessionId: manifest.sessionId,
    sessionDirectory: `.zenfix-data/pilot-validation/sessions/${manifest.sessionId}`,
    storeGeneration: manifest.storeGeneration,
    storeEnvelopeChecksum: manifest.storeEnvelopeChecksum,
    manifestChecksum: manifest.manifestChecksum,
    sandboxOnly: true,
    warning: "SANDBOX / NO REAL FUNDS",
  })}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Pilot preparation failure";
  process.stderr.write(`Pilot preparation failed: ${message}\n`);
  process.exitCode = 1;
});
