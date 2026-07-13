import { cp, lstat, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { preparePilotSession } from "@/features/payrun/pilot/session-preparation";
import { createPilotSessionReader } from "@/features/payrun/pilot/session-reader";
import { PilotManifestValidationError, PilotStoreIntegrityError } from "@/features/payrun/pilot/session-errors";

const roots: string[] = [];
const createdAt = "2026-07-14T00:15:00.000Z";
const sourceCommit = "93ecba37dcf5084360f33adde5e9a520d968bcb0";
const sessionId = "20260714T001500.000Z-93ecba3";
let fixtureRoot: string;

beforeAll(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "zenfix-pilot-reader-fixture-"));
  await preparePilotSession({
    repoRoot: fixtureRoot,
    createdAt,
    sourceCommit,
    operationId: "reader-fixture",
  });
}, 20_000);

async function prepared() {
  const repoRoot = await mkdtemp(join(tmpdir(), "zenfix-pilot-reader-"));
  roots.push(repoRoot);
  await cp(join(fixtureRoot, ".zenfix-data"), join(repoRoot, ".zenfix-data"), { recursive: true });
  return repoRoot;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
afterAll(async () => rm(fixtureRoot, { recursive: true, force: true }));

describe("Dedicated PilotSessionReader", () => {
  it("loads current, historical, and one scenario through a three-method read-only API", async () => {
    const repoRoot = await prepared();
    const reader = createPilotSessionReader({ repoRoot });

    expect(Object.keys(reader).sort()).toEqual(["loadCurrentSession", "loadScenario", "loadSession"]);
    await expect(reader.loadCurrentSession()).resolves.toMatchObject({ sessionId, scenarios: { length: 4 } });
    await expect(reader.loadSession(sessionId)).resolves.toMatchObject({ sessionId });
    await expect(reader.loadScenario(sessionId, "blocked")).resolves.toMatchObject({
      name: "blocked", actualFinalStatus: "blocked",
    });
  }, 20_000);

  it("does not create a lease or modify pointer, manifest, store, generation, or PayRun count", async () => {
    const repoRoot = await prepared();
    const sessionRoot = join(repoRoot, ".zenfix-data", "pilot-validation", "sessions", sessionId);
    const paths = [
      join(repoRoot, ".zenfix-data", "pilot-validation", "current.json"),
      join(sessionRoot, "pilot-session-manifest.json"),
      join(sessionRoot, "payrun-store.json"),
    ];
    const before = await Promise.all(paths.map(async (path) => ({
      bytes: await readFile(path, "utf8"),
      mtimeMs: (await stat(path)).mtimeMs,
    })));
    const reader = createPilotSessionReader({ repoRoot });

    const first = await reader.loadCurrentSession();
    const second = await reader.loadCurrentSession();

    expect(second).toEqual(first);
    for (let index = 0; index < paths.length; index += 1) {
      expect(await readFile(paths[index]!, "utf8")).toBe(before[index]!.bytes);
      expect((await stat(paths[index]!)).mtimeMs).toBe(before[index]!.mtimeMs);
    }
    await expect(lstat(`${join(sessionRoot, "payrun-store.json")}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("fails the whole load when the manifest or store is tampered", async () => {
    const repoRoot = await prepared();
    const sessionRoot = join(repoRoot, ".zenfix-data", "pilot-validation", "sessions", sessionId);
    const manifestPath = join(sessionRoot, "pilot-session-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, storeGeneration: 999 }), "utf8");
    await expect(createPilotSessionReader({ repoRoot }).loadSession(sessionId))
      .rejects.toBeInstanceOf(PilotManifestValidationError);

    const repoRoot2 = await prepared();
    const storePath = join(repoRoot2, ".zenfix-data", "pilot-validation", "sessions", sessionId, "payrun-store.json");
    const store = await readFile(storePath, "utf8");
    await writeFile(storePath, `${store.slice(0, -2)}x}`, "utf8");
    await expect(createPilotSessionReader({ repoRoot: repoRoot2 }).loadSession(sessionId))
      .rejects.toBeInstanceOf(PilotStoreIntegrityError);
  }, 30_000);

  it("binds the requested session identifier to the checksummed manifest", async () => {
    const repoRoot = await prepared();
    const pilotRoot = join(repoRoot, ".zenfix-data", "pilot-validation");
    const original = join(pilotRoot, "sessions", sessionId);
    const aliasId = "20260714T001501.000Z-93ecba3";
    await cp(original, join(pilotRoot, "sessions", aliasId), { recursive: true });

    await expect(createPilotSessionReader({ repoRoot }).loadSession(aliasId))
      .rejects.toBeInstanceOf(PilotManifestValidationError);
  });

  it("reads current.json once and binds its manifest checksum for the complete load", async () => {
    const repoRoot = await prepared();
    const currentPath = join(repoRoot, ".zenfix-data", "pilot-validation", "current.json");
    let currentReads = 0;
    const reader = createPilotSessionReader({
      repoRoot,
      async readText(path) {
        if (path === currentPath || path.endsWith("/.zenfix-data/pilot-validation/current.json")) currentReads += 1;
        return readFile(path, "utf8");
      },
    });

    await reader.loadCurrentSession();

    expect(currentReads).toBe(1);
  }, 20_000);
});
