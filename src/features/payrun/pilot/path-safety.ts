import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { PilotPathBoundaryError, PilotSessionNotFoundError } from "./session-errors";
import { assertPilotSessionId } from "./session-schemas";
import { PILOT_MANIFEST_FILE, PILOT_STORE_FILE } from "./session-contracts";

export interface PilotSessionPaths {
  readonly sessionDirectory: string;
  readonly manifestPath: string;
  readonly storePath: string;
}

function isContained(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference));
}

async function requireDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new PilotPathBoundaryError(`${label} must be a real directory`);
  }
}

async function requireRegularFile(path: string, label: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new PilotPathBoundaryError(`${label} must be a real regular file`);
  }
}

async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PilotPathBoundaryError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new PilotSessionNotFoundError("Pilot Session path does not exist", error);
    }
    throw new PilotPathBoundaryError("Pilot path could not be safely resolved", error);
  }
}

export async function resolvePilotRoot(repoRoot: string): Promise<string> {
  return safe(async () => {
    if (!isAbsolute(repoRoot)) throw new PilotPathBoundaryError("Repository root must be absolute");
    await requireDirectory(repoRoot, "Repository root");
    const canonicalRepo = await realpath(repoRoot);
    const dataDirectory = join(canonicalRepo, ".zenfix-data");
    const pilotRoot = join(dataDirectory, "pilot-validation");
    await requireDirectory(dataDirectory, "Pilot data directory");
    await requireDirectory(pilotRoot, "Pilot root");
    const canonicalPilotRoot = await realpath(pilotRoot);
    if (!isContained(canonicalRepo, canonicalPilotRoot)) {
      throw new PilotPathBoundaryError("Pilot root escapes repository root");
    }
    return canonicalPilotRoot;
  });
}

export async function resolvePilotSessionPaths(
  pilotRoot: string,
  sessionId: string,
): Promise<PilotSessionPaths> {
  return safe(async () => {
    try { assertPilotSessionId(sessionId); } catch (error) {
      throw new PilotPathBoundaryError("Pilot Session identifier is invalid", error);
    }
    const sessionsDirectory = join(pilotRoot, "sessions");
    const sessionDirectory = join(sessionsDirectory, sessionId);
    const manifestPath = join(sessionDirectory, PILOT_MANIFEST_FILE);
    const storePath = join(sessionDirectory, PILOT_STORE_FILE);

    await requireDirectory(sessionsDirectory, "Pilot sessions directory");
    await requireDirectory(sessionDirectory, "Pilot Session directory");
    await requireRegularFile(manifestPath, "Pilot manifest");
    await requireRegularFile(storePath, "Pilot store");

    const [canonicalSession, canonicalManifest, canonicalStore] = await Promise.all([
      realpath(sessionDirectory), realpath(manifestPath), realpath(storePath),
    ]);
    for (const candidate of [canonicalSession, canonicalManifest, canonicalStore]) {
      if (!isContained(pilotRoot, candidate)) {
        throw new PilotPathBoundaryError("Pilot Session path escapes Pilot root");
      }
    }
    if (canonicalSession !== sessionDirectory || canonicalManifest !== manifestPath || canonicalStore !== storePath) {
      throw new PilotPathBoundaryError("Pilot Session path contains an alias");
    }
    return { sessionDirectory, manifestPath, storePath };
  });
}

export async function resolvePilotCurrentPath(pilotRoot: string): Promise<string> {
  return safe(async () => {
    const currentPath = join(pilotRoot, "current.json");
    await requireRegularFile(currentPath, "Pilot current pointer");
    const canonicalCurrent = await realpath(currentPath);
    if (!isContained(pilotRoot, canonicalCurrent) || canonicalCurrent !== currentPath) {
      throw new PilotPathBoundaryError("Pilot current pointer escapes Pilot root");
    }
    return currentPath;
  });
}
