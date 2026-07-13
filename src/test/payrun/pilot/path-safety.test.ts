import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolvePilotRoot,
  resolvePilotSessionPaths,
} from "@/features/payrun/pilot/path-safety";
import { PilotPathBoundaryError } from "@/features/payrun/pilot/session-errors";

const roots: string[] = [];
const sessionId = "20260714T001500.000Z-93ecba3";

async function tree() {
  const repoRoot = await mkdtemp(join(tmpdir(), "zenfix-pilot-path-"));
  roots.push(repoRoot);
  const pilotRoot = join(repoRoot, ".zenfix-data", "pilot-validation");
  const session = join(pilotRoot, "sessions", sessionId);
  await mkdir(session, { recursive: true });
  await writeFile(join(session, "pilot-session-manifest.json"), "{}", "utf8");
  await writeFile(join(session, "payrun-store.json"), "{}", "utf8");
  await writeFile(join(pilotRoot, "current.json"), "{}", "utf8");
  return { repoRoot, pilotRoot, session };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PV-1 path containment", () => {
  it("resolves only fixed files beneath the canonical Pilot root", async () => {
    const { repoRoot, pilotRoot } = await tree();
    const root = await resolvePilotRoot(repoRoot);
    const paths = await resolvePilotSessionPaths(root, sessionId);

    const canonicalPilotRoot = await realpath(pilotRoot);
    expect(root).toBe(canonicalPilotRoot);
    expect(paths).toEqual({
      sessionDirectory: join(canonicalPilotRoot, "sessions", sessionId),
      manifestPath: join(canonicalPilotRoot, "sessions", sessionId, "pilot-session-manifest.json"),
      storePath: join(canonicalPilotRoot, "sessions", sessionId, "payrun-store.json"),
    });
  });

  it.each(["../escape", "/tmp/store", "bad/session", "bad\\session", "x%2F..", "\0bad"])(
    "rejects unsafe session id %j",
    async (unsafe) => {
      const { repoRoot } = await tree();
      const root = await resolvePilotRoot(repoRoot);
      await expect(resolvePilotSessionPaths(root, unsafe)).rejects.toBeInstanceOf(PilotPathBoundaryError);
    },
  );

  it("fails closed when the session directory is a symlink", async () => {
    const { repoRoot, pilotRoot, session } = await tree();
    const outside = await mkdtemp(join(tmpdir(), "zenfix-pilot-outside-"));
    roots.push(outside);
    await rm(session, { recursive: true, force: true });
    await symlink(outside, session);

    const root = await resolvePilotRoot(repoRoot);
    await expect(resolvePilotSessionPaths(root, sessionId)).rejects.toBeInstanceOf(PilotPathBoundaryError);
    expect(pilotRoot).not.toBe(outside);
  });

  it("fails closed when the configured repository root is a symlink alias", async () => {
    const { repoRoot } = await tree();
    const alias = `${repoRoot}-alias`;
    roots.push(alias);
    await symlink(repoRoot, alias, "dir");

    await expect(resolvePilotRoot(alias)).rejects.toBeInstanceOf(PilotPathBoundaryError);
  });

  it("fails closed when a fixed session file is a symlink", async () => {
    const { repoRoot, session } = await tree();
    const outside = join(repoRoot, "outside.json");
    await writeFile(outside, "{}", "utf8");
    await rm(join(session, "payrun-store.json"));
    await symlink(outside, join(session, "payrun-store.json"));

    const root = await resolvePilotRoot(repoRoot);
    await expect(resolvePilotSessionPaths(root, sessionId)).rejects.toBeInstanceOf(PilotPathBoundaryError);
  });
});
