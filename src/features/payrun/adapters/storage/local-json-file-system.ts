import { open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import {
  AtomicStoreWriteError,
  LeaseLostError,
  StoreDurabilityError,
  type AtomicStoreWriteStage,
} from "./errors";

export interface LocalJsonFileHandle {
  write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): Promise<number>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface LocalJsonFileSystem {
  open(path: string, flags: "wx" | "r", mode?: number): Promise<LocalJsonFileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface DirectoryFsyncUnsupportedDiagnostic {
  readonly kind: "directory_fsync_unsupported";
  readonly code: "EINVAL" | "ENOTSUP" | "EISDIR";
  readonly directoryPath: string;
  readonly cause: unknown;
}

export interface AtomicReplaceLocalJsonStoreOptions {
  readonly canonicalStorePath: string;
  readonly instanceId: string;
  readonly operationId?: string;
  readonly serializedEnvelope: string;
  readonly committedGeneration: number;
  readonly assertWriterLeaseOwned: () => Promise<void>;
  readonly fileSystem?: LocalJsonFileSystem;
  readonly nextOperationId?: () => string;
  readonly onDiagnostic?: (diagnostic: DirectoryFsyncUnsupportedDiagnostic) => void;
}

export const nodeLocalJsonFileSystem: LocalJsonFileSystem = {
  async open(path, flags, mode) {
    const handle = await open(path, flags, mode);
    return {
      async write(buffer, offset, length, position) {
        const result = await handle.write(buffer, offset, length, position);
        return result.bytesWritten;
      },
      async sync() {
        await handle.sync();
      },
      async close() {
        await handle.close();
      },
    };
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async unlink(path) {
    await unlink(path);
  },
};

export function temporaryStorePathFor(
  canonicalStorePath: string,
  instanceId: string,
  operationId: string,
): string {
  const directoryPath = dirname(canonicalStorePath);
  const storeFilename = basename(canonicalStorePath);
  return join(
    directoryPath,
    `.${storeFilename}.tmp.${encodeURIComponent(instanceId)}.${encodeURIComponent(operationId)}`,
  );
}

export async function atomicReplaceLocalJsonStore(
  options: AtomicReplaceLocalJsonStoreOptions,
): Promise<void> {
  const fileSystem = options.fileSystem ?? nodeLocalJsonFileSystem;
  const operationId = options.operationId ?? options.nextOperationId?.() ?? randomUUID();
  const temporaryPath = temporaryStorePathFor(
    options.canonicalStorePath,
    options.instanceId,
    operationId,
  );
  const bytes = new TextEncoder().encode(options.serializedEnvelope);

  let temporaryHandle: LocalJsonFileHandle;
  try {
    temporaryHandle = await fileSystem.open(temporaryPath, "wx", 0o600);
  } catch (error) {
    throw atomicError("open_temp", temporaryPath, error);
  }

  try {
    try {
      await writeComplete(temporaryHandle, bytes);
    } catch (error) {
      throw atomicError("write_temp", temporaryPath, error);
    }

    try {
      await temporaryHandle.sync();
    } catch (error) {
      throw atomicError("fsync_temp", temporaryPath, error);
    }

    try {
      await temporaryHandle.close();
    } catch (error) {
      throw atomicError("close_temp", temporaryPath, error);
    }

    await options.assertWriterLeaseOwned();

    try {
      await fileSystem.rename(temporaryPath, options.canonicalStorePath);
    } catch (error) {
      throw atomicError("rename", options.canonicalStorePath, error);
    }
  } catch (error) {
    await closeIgnoringErrors(temporaryHandle);
    await unlinkIgnoringErrors(fileSystem, temporaryPath);
    if (error instanceof LeaseLostError) throw error;
    throw error;
  }

  await confirmDirectoryDurability({
    fileSystem,
    directoryPath: dirname(options.canonicalStorePath),
    committedGeneration: options.committedGeneration,
    onDiagnostic: options.onDiagnostic,
  });
}

async function writeComplete(handle: LocalJsonFileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const bytesWritten = await handle.write(bytes, offset, bytes.byteLength - offset, null);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.byteLength - offset) {
      throw new Error("Temporary store write did not report valid forward progress");
    }
    offset += bytesWritten;
  }
}

async function confirmDirectoryDurability(input: {
  readonly fileSystem: LocalJsonFileSystem;
  readonly directoryPath: string;
  readonly committedGeneration: number;
  readonly onDiagnostic?: (diagnostic: DirectoryFsyncUnsupportedDiagnostic) => void;
}): Promise<void> {
  let directoryHandle: LocalJsonFileHandle;
  try {
    directoryHandle = await input.fileSystem.open(input.directoryPath, "r");
  } catch (error) {
    throw new StoreDurabilityError(input.committedGeneration, { cause: error });
  }

  let syncError: unknown;
  try {
    await directoryHandle.sync();
  } catch (error) {
    syncError = error;
  }

  let closeError: unknown;
  try {
    await directoryHandle.close();
  } catch (error) {
    closeError = error;
  }

  if (syncError !== undefined && isUnsupportedDirectoryFsyncError(syncError)) {
    if (closeError !== undefined) {
      throw new StoreDurabilityError(input.committedGeneration, { cause: closeError });
    }
    recordDiagnostic(input.onDiagnostic, {
      kind: "directory_fsync_unsupported",
      code: syncError.code,
      directoryPath: input.directoryPath,
      cause: syncError,
    });
    return;
  }

  const durabilityError = syncError ?? closeError;
  if (durabilityError !== undefined) {
    throw new StoreDurabilityError(input.committedGeneration, { cause: durabilityError });
  }
}

function atomicError(
  stage: AtomicStoreWriteStage,
  path: string,
  cause: unknown,
): AtomicStoreWriteError {
  if (cause instanceof AtomicStoreWriteError) return cause;
  return new AtomicStoreWriteError(stage, path, { cause });
}

function isUnsupportedDirectoryFsyncError(
  error: unknown,
): error is NodeJS.ErrnoException & { code: "EINVAL" | "ENOTSUP" | "EISDIR" } {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code !== undefined &&
    ["EINVAL", "ENOTSUP", "EISDIR"].includes((error as NodeJS.ErrnoException).code as string)
  );
}

async function closeIgnoringErrors(handle: LocalJsonFileHandle): Promise<void> {
  await handle.close().catch(() => undefined);
}

async function unlinkIgnoringErrors(
  fileSystem: LocalJsonFileSystem,
  temporaryPath: string,
): Promise<void> {
  await fileSystem.unlink(temporaryPath).catch(() => undefined);
}

function recordDiagnostic(
  sink: ((diagnostic: DirectoryFsyncUnsupportedDiagnostic) => void) | undefined,
  diagnostic: DirectoryFsyncUnsupportedDiagnostic,
): void {
  try {
    sink?.(diagnostic);
  } catch {
    // A diagnostic sink cannot turn an explicitly unsupported directory fsync into commit failure.
  }
}
