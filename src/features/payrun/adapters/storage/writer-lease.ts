import { access, open, realpath, rename, stat, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { hostname as currentHostname } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { LeaseLostError, StoreLockedError, StorePathError } from "./errors";

export interface WriterLeaseMetadata {
  readonly pid: number;
  readonly hostname: string;
  readonly instanceId: string;
  readonly createdAt: string;
  readonly canonicalStorePath: string;
}

export type ProcessProbe = (pid: number) => void;

export interface AcquireWriterLeaseOptions {
  readonly canonicalStorePath: string;
  readonly instanceId: string;
  readonly now?: () => string;
  readonly nextOperationId?: () => string;
  readonly probeProcess?: ProcessProbe;
}

export interface WriterLease {
  readonly canonicalStorePath: string;
  readonly lockPath: string;
  readonly metadata: WriterLeaseMetadata;
  assertOwned(): Promise<void>;
  release(): Promise<void>;
}

interface InspectedLock {
  readonly bytes: string;
  readonly device: number;
  readonly inode: number;
  readonly metadata: WriterLeaseMetadata;
}

export async function canonicalizeStorePath(storePath: string): Promise<string> {
  const absoluteCandidate = resolve(storePath);
  const parentDirectory = dirname(absoluteCandidate);

  try {
    const realParentDirectory = await realpath(parentDirectory);
    if (!(await stat(realParentDirectory)).isDirectory()) {
      throw new Error("Local JSON store parent is not a directory");
    }
    await access(realParentDirectory, constants.R_OK | constants.W_OK | constants.X_OK);
    return join(realParentDirectory, basename(absoluteCandidate));
  } catch (error) {
    throw new StorePathError(storePath, "Local JSON store parent directory cannot be resolved", {
      cause: error,
    });
  }
}

export function writerLeasePathFor(canonicalStorePath: string): string {
  return `${canonicalStorePath}.lock`;
}

export async function acquireWriterLease(
  options: AcquireWriterLeaseOptions,
): Promise<WriterLease> {
  const metadata: WriterLeaseMetadata = {
    pid: process.pid,
    hostname: currentHostname(),
    instanceId: options.instanceId,
    createdAt: (options.now ?? (() => new Date().toISOString()))(),
    canonicalStorePath: options.canonicalStorePath,
  };
  assertAcquisitionMetadata(metadata);

  const lockPath = writerLeasePathFor(options.canonicalStorePath);
  const nextOperationId = options.nextOperationId ?? randomUUID;
  const probeProcess = options.probeProcess ?? ((pid: number) => process.kill(pid, 0));

  try {
    await createExclusiveLock(lockPath, metadata);
  } catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
    await recoverProvenStaleLock({
      canonicalStorePath: options.canonicalStorePath,
      lockPath,
      instanceId: options.instanceId,
      operationId: nextOperationId(),
      probeProcess,
    });

    try {
      await createExclusiveLock(lockPath, metadata);
    } catch (retryError) {
      if (hasCode(retryError, "EEXIST")) {
        throw new StoreLockedError(options.canonicalStorePath, undefined, { cause: retryError });
      }
      throw retryError;
    }
  }

  let released = false;
  return {
    canonicalStorePath: options.canonicalStorePath,
    lockPath,
    metadata,
    async assertOwned() {
      if (released) throw new LeaseLostError(options.canonicalStorePath);
      await assertLockOwned(lockPath, metadata);
    },
    async release() {
      if (released) return;
      await releaseOwnedLock(lockPath, metadata, nextOperationId());
      released = true;
    },
  };
}

async function createExclusiveLock(
  lockPath: string,
  metadata: WriterLeaseMetadata,
): Promise<void> {
  const handle = await open(lockPath, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(metadata), "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await removeOnlyIfOwned(lockPath, metadata).catch(() => undefined);
    throw error;
  }
  await handle.close();
}

async function recoverProvenStaleLock(input: {
  readonly canonicalStorePath: string;
  readonly lockPath: string;
  readonly instanceId: string;
  readonly operationId: string;
  readonly probeProcess: ProcessProbe;
}): Promise<void> {
  let inspected: InspectedLock;
  try {
    inspected = await inspectLock(input.lockPath);
  } catch (error) {
    throw new StoreLockedError(input.canonicalStorePath, undefined, { cause: error });
  }

  if (inspected.metadata.canonicalStorePath !== input.canonicalStorePath) {
    throw new StoreLockedError(input.canonicalStorePath);
  }
  if (inspected.metadata.hostname !== currentHostname()) {
    throw new StoreLockedError(input.canonicalStorePath);
  }

  try {
    input.probeProcess(inspected.metadata.pid);
    throw new StoreLockedError(input.canonicalStorePath);
  } catch (error) {
    if (error instanceof StoreLockedError) throw error;
    if (!hasCode(error, "ESRCH")) {
      throw new StoreLockedError(input.canonicalStorePath, undefined, { cause: error });
    }
  }

  const quarantinePath = quarantinePathFor(
    input.lockPath,
    input.instanceId,
    input.operationId,
    "stale",
  );
  try {
    await rename(input.lockPath, quarantinePath);
  } catch (error) {
    throw new StoreLockedError(input.canonicalStorePath, undefined, { cause: error });
  }

  let quarantined: InspectedLock;
  try {
    quarantined = await inspectLock(quarantinePath);
    if (!sameFileAndBytes(inspected, quarantined)) {
      await restoreQuarantinedLock(input.lockPath, quarantinePath, quarantined.bytes);
      throw new StoreLockedError(input.canonicalStorePath);
    }
    await unlink(quarantinePath);
  } catch (error) {
    if (error instanceof StoreLockedError) throw error;
    throw new StoreLockedError(input.canonicalStorePath, undefined, { cause: error });
  }
}

async function assertLockOwned(
  lockPath: string,
  expected: WriterLeaseMetadata,
): Promise<void> {
  try {
    const inspected = await inspectLock(lockPath);
    if (!sameOwner(inspected.metadata, expected)) throw new Error("Writer lease owner changed");
  } catch (error) {
    throw new LeaseLostError(expected.canonicalStorePath, undefined, { cause: error });
  }
}

async function releaseOwnedLock(
  lockPath: string,
  expected: WriterLeaseMetadata,
  operationId: string,
): Promise<void> {
  let inspected: InspectedLock;
  try {
    inspected = await inspectLock(lockPath);
    if (!sameOwner(inspected.metadata, expected)) throw new Error("Writer lease owner changed");
  } catch (error) {
    throw new LeaseLostError(expected.canonicalStorePath, undefined, { cause: error });
  }

  const quarantinePath = quarantinePathFor(lockPath, expected.instanceId, operationId, "release");
  try {
    await rename(lockPath, quarantinePath);
    const quarantined = await inspectLock(quarantinePath);
    if (!sameFileAndBytes(inspected, quarantined) || !sameOwner(quarantined.metadata, expected)) {
      await restoreQuarantinedLock(lockPath, quarantinePath, quarantined.bytes);
      throw new Error("Writer lease changed during release");
    }
    await unlink(quarantinePath);
  } catch (error) {
    throw new LeaseLostError(expected.canonicalStorePath, undefined, { cause: error });
  }
}

async function removeOnlyIfOwned(
  lockPath: string,
  expected: WriterLeaseMetadata,
): Promise<void> {
  try {
    await assertLockOwned(lockPath, expected);
  } catch {
    return;
  }
  await releaseOwnedLock(lockPath, expected, randomUUID());
}

async function inspectLock(lockPath: string): Promise<InspectedLock> {
  const handle = await open(lockPath, "r");
  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) throw new Error("Writer lease is not a regular file");
    const bytes = await handle.readFile("utf8");
    const currentPathStat = await stat(lockPath);
    if (fileStat.dev !== currentPathStat.dev || fileStat.ino !== currentPathStat.ino) {
      throw new Error("Writer lease path changed during inspection");
    }
    return {
      bytes,
      device: fileStat.dev,
      inode: fileStat.ino,
      metadata: parseMetadata(bytes),
    };
  } finally {
    await handle.close();
  }
}

function parseMetadata(bytes: string): WriterLeaseMetadata {
  const value: unknown = JSON.parse(bytes);
  if (!isPlainObject(value)) throw new Error("Invalid writer lease metadata");
  const keys = Object.keys(value).sort();
  const expectedKeys = ["canonicalStorePath", "createdAt", "hostname", "instanceId", "pid"];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Invalid writer lease metadata keys");
  }
  const metadata = value as unknown as WriterLeaseMetadata;
  assertMetadata(metadata);
  return metadata;
}

function assertAcquisitionMetadata(metadata: WriterLeaseMetadata): void {
  assertMetadata(metadata);
}

function assertMetadata(metadata: WriterLeaseMetadata): void {
  if (!Number.isSafeInteger(metadata.pid) || metadata.pid <= 0) {
    throw new Error("Invalid writer lease PID");
  }
  if (typeof metadata.hostname !== "string" || metadata.hostname.length === 0) {
    throw new Error("Invalid writer lease hostname");
  }
  if (typeof metadata.instanceId !== "string" || metadata.instanceId.length === 0) {
    throw new Error("Invalid writer lease instanceId");
  }
  if (
    typeof metadata.createdAt !== "string" ||
    !metadata.createdAt.endsWith("Z") ||
    !Number.isFinite(Date.parse(metadata.createdAt))
  ) {
    throw new Error("Invalid writer lease creation time");
  }
  if (
    typeof metadata.canonicalStorePath !== "string" ||
    !isAbsolute(metadata.canonicalStorePath)
  ) {
    throw new Error("Invalid canonical store path in writer lease");
  }
}

function sameOwner(left: WriterLeaseMetadata, right: WriterLeaseMetadata): boolean {
  return (
    left.pid === right.pid &&
    left.hostname === right.hostname &&
    left.instanceId === right.instanceId &&
    left.canonicalStorePath === right.canonicalStorePath
  );
}

function sameFileAndBytes(left: InspectedLock, right: InspectedLock): boolean {
  return left.device === right.device && left.inode === right.inode && left.bytes === right.bytes;
}

async function restoreQuarantinedLock(
  lockPath: string,
  quarantinePath: string,
  bytes: string,
): Promise<void> {
  try {
    const handle = await open(lockPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await unlink(quarantinePath).catch(() => undefined);
  } catch {
    // Another writer won the active path. Leave the operation-owned quarantine for diagnosis.
  }
}

function quarantinePathFor(
  lockPath: string,
  instanceId: string,
  operationId: string,
  purpose: "stale" | "release",
): string {
  return join(
    dirname(lockPath),
    `.${basename(lockPath)}.${purpose}.${pathComponent(instanceId)}.${pathComponent(operationId)}`,
  );
}

function pathComponent(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
