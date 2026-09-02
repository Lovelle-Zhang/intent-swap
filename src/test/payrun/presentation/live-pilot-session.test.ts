import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildLivePilotSession } from "@/features/payrun/presentation/live-pilot-session";

const COMMITTED_CURRENT = join(process.cwd(), ".zenfix-data", "pilot-validation", "current.json");

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

describe("live Command Center session builder", () => {
  it("runs the real control loop live and derives a valid four-scenario view", async () => {
    const session = await buildLivePilotSession();

    expect(session.sandboxOnly).toBe(true);
    expect(typeof session.watermark).toBe("string");
    expect(session.watermark.length).toBeGreaterThan(0);
    expect(
      session.scenarios.map((scenario) => [scenario.name, scenario.actualFinalStatus]),
    ).toEqual([
      ["allowed", "completed"],
      ["needs_review", "pending_review"],
      ["blocked", "blocked"],
      ["funding_mismatch", "completed"],
    ]);
    for (const scenario of session.scenarios) {
      expect(scenario.payRunId).toBeTruthy();
      expect(scenario.explanation).toBeTruthy();
      expect(scenario.policy.outcome).toBeTruthy();
    }
  }, 20_000);

  it("re-executes fresh each call (new session id) and never touches the committed snapshot", async () => {
    const before = await readOrNull(COMMITTED_CURRENT);

    const first = await buildLivePilotSession();
    const second = await buildLivePilotSession();

    // Live, not cached: each build is its own execution with a distinct id.
    expect(first.sessionId).not.toBe(second.sessionId);

    // The pre-baked pilot snapshot is the offline path's territory — the live
    // builder must leave it byte-for-byte untouched.
    const after = await readOrNull(COMMITTED_CURRENT);
    expect(after).toBe(before);
  }, 30_000);
});
