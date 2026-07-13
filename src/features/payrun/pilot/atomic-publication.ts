import { open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { canonicalStringify } from "../adapters/storage/canonical-json";
import { PilotPublicationError } from "./session-errors";

const UNSUPPORTED_DIRECTORY_FSYNC = new Set(["EINVAL", "ENOTSUP", "EISDIR"]);

function code(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export async function fsyncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!UNSUPPORTED_DIRECTORY_FSYNC.has(code(error) ?? "")) throw error;
  } finally {
    await handle?.close();
  }
}

export async function writeCanonicalJsonAtomically(
  path: string,
  value: unknown,
  operationId: string,
): Promise<void> {
  const directory = dirname(path);
  const tempPath = join(directory, `.${operationId}.${Date.now()}.tmp`);
  let handle;
  try {
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(canonicalStringify(value), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempPath, path);
    await fsyncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new PilotPublicationError("Atomic Pilot JSON publication failed", error);
  }
}

export async function publishPilotSessionDirectory(
  temporaryDirectory: string,
  finalDirectory: string,
): Promise<void> {
  try {
    await fsyncDirectory(temporaryDirectory);
    await rename(temporaryDirectory, finalDirectory);
    await fsyncDirectory(dirname(finalDirectory));
  } catch (error) {
    throw new PilotPublicationError("Pilot Session directory publication failed", error);
  }
}
