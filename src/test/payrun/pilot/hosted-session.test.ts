import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  loadBundledHostedPilotSession,
  parseBundledPilotSession,
  resolveCurrentPilotSession,
} from "@/features/payrun/pilot/hosted-session";
import {
  PilotSessionNotFoundError,
  PilotStoreIntegrityError,
} from "@/features/payrun/pilot/session-errors";
import type { PilotSessionView } from "@/features/payrun/pilot/session-contracts";

const fixtureRoot = join(
  process.cwd(),
  "src/features/payrun/pilot/hosted-fixture",
);

describe("Hosted Pilot Session", () => {
  it("loads one checksummed Sandbox session containing the four canonical scenarios", async () => {
    const session = await loadBundledHostedPilotSession();

    expect(session.sandboxOnly).toBe(true);
    expect(session.watermark).toBe("SANDBOX / NO REAL FUNDS");
    expect(session.scenarios.map(({ name, actualFinalStatus }) => [name, actualFinalStatus])).toEqual([
      ["allowed", "completed"],
      ["needs_review", "pending_review"],
      ["blocked", "blocked"],
      ["funding_mismatch", "completed"],
    ]);
    expect(session.scenarios.find(({ name }) => name === "allowed")?.funding?.status).toBe("not_required");
    expect(session.scenarios.find(({ name }) => name === "funding_mismatch")?.funding?.status).toBe("sandbox_prepared");
  });

  it("rejects a tampered bundled store instead of showing unverified data", async () => {
    const pointerText = await readFile(join(fixtureRoot, "current.json"), "utf8");
    const pointer = JSON.parse(pointerText) as { sessionId: string };
    const sessionRoot = join(fixtureRoot, "sessions", pointer.sessionId);
    const manifestText = await readFile(join(sessionRoot, "pilot-session-manifest.json"), "utf8");
    const store = JSON.parse(await readFile(join(sessionRoot, "payrun-store.json"), "utf8"));
    store.payload.payRuns[0].intent.purpose = "tampered";

    expect(() => parseBundledPilotSession({
      pointerText,
      manifestText,
      storeText: JSON.stringify(store),
    })).toThrow(PilotStoreIntegrityError);
  });

  it("uses local canonical data first and only falls back for a missing Preview session", async () => {
    const bundled = await loadBundledHostedPilotSession();
    const local = { ...bundled, sessionId: "local-session" } satisfies PilotSessionView;
    const loadBundled = vi.fn(async () => bundled);

    await expect(resolveCurrentPilotSession({
      vercelEnvironment: "preview",
      localReader: { loadCurrentSession: async () => local },
      loadBundled,
    })).resolves.toBe(local);
    expect(loadBundled).not.toHaveBeenCalled();

    await expect(resolveCurrentPilotSession({
      vercelEnvironment: "preview",
      localReader: { loadCurrentSession: async () => { throw new PilotSessionNotFoundError(); } },
      loadBundled,
    })).resolves.toBe(bundled);
    expect(loadBundled).toHaveBeenCalledOnce();
  });

  it("does not mask integrity failures or enable the hosted fixture outside Preview", async () => {
    const integrityFailure = new PilotStoreIntegrityError("broken store");
    await expect(resolveCurrentPilotSession({
      vercelEnvironment: "preview",
      localReader: { loadCurrentSession: async () => { throw integrityFailure; } },
      loadBundled: loadBundledHostedPilotSession,
    })).rejects.toBe(integrityFailure);

    const missing = new PilotSessionNotFoundError();
    await expect(resolveCurrentPilotSession({
      vercelEnvironment: "production",
      localReader: { loadCurrentSession: async () => { throw missing; } },
      loadBundled: loadBundledHostedPilotSession,
    })).rejects.toBe(missing);
  });
});
