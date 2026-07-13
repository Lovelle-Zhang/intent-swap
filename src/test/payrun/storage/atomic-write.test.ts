import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  atomicReplaceLocalJsonStore,
  nodeLocalJsonFileSystem,
  type LocalJsonFileHandle,
  type LocalJsonFileSystem,
} from "@/features/payrun/adapters/storage/local-json-file-system";
import {
  AtomicStoreWriteError,
  LeaseLostError,
  StoreDurabilityError,
} from "@/features/payrun/adapters/storage/errors";

type FailureStage =
  | "open_temp"
  | "write_temp"
  | "fsync_temp"
  | "close_temp"
  | "rename"
  | "open_directory"
  | "fsync_directory"
  | "close_directory"
  | "cleanup_temp";

function ioError(code = "EIO"): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

class MemoryFileSystem implements LocalJsonFileSystem {
  readonly events: string[] = [];
  readonly files = new Map<string, Uint8Array>();
  failure?: FailureStage;
  directoryErrorCode = "EIO";
  partialWriteThenFail = false;
  private writeCalls = 0;

  async open(path: string, flags: "wx" | "r", _mode?: number): Promise<LocalJsonFileHandle> {
    const isDirectory = flags === "r";
    const label = isDirectory ? "directory" : "temp";
    this.events.push(`open ${label} ${path}`);
    if (this.failure === (isDirectory ? "open_directory" : "open_temp")) {
      throw ioError(isDirectory ? this.directoryErrorCode : "EIO");
    }
    if (!isDirectory && this.files.has(path)) throw ioError("EEXIST");
    if (!isDirectory) this.files.set(path, new Uint8Array());

    return {
      write: async (buffer, offset, length) => {
        this.events.push(`write ${label}`);
        if (this.failure === "write_temp") throw ioError();
        if (this.partialWriteThenFail && this.writeCalls++ > 0) throw ioError();
        const bytesWritten = this.partialWriteThenFail ? Math.max(1, Math.floor(length / 2)) : length;
        const previous = this.files.get(path) ?? new Uint8Array();
        const next = new Uint8Array(previous.length + bytesWritten);
        next.set(previous);
        next.set(buffer.subarray(offset, offset + bytesWritten), previous.length);
        this.files.set(path, next);
        return bytesWritten;
      },
      sync: async () => {
        this.events.push(`fsync ${label}`);
        if (this.failure === (isDirectory ? "fsync_directory" : "fsync_temp")) {
          throw ioError(isDirectory ? this.directoryErrorCode : "EIO");
        }
      },
      close: async () => {
        this.events.push(`close ${label}`);
        if (this.failure === (isDirectory ? "close_directory" : "close_temp")) throw ioError();
      },
    };
  }

  async rename(from: string, to: string): Promise<void> {
    this.events.push(`rename ${from} ${to}`);
    if (this.failure === "rename") throw ioError();
    const bytes = this.files.get(from);
    if (bytes === undefined) throw ioError("ENOENT");
    this.files.set(to, bytes);
    this.files.delete(from);
  }

  async unlink(path: string): Promise<void> {
    this.events.push(`unlink ${path}`);
    if (this.failure === "cleanup_temp") throw ioError();
    if (!this.files.delete(path)) throw ioError("ENOENT");
  }
}

const storePath = "/sandbox/payrun-store.json";
const originalBytes = new TextEncoder().encode('{"generation":4}');
const replacementText = '{"generation":5,"complete":true}';
const replacementBytes = new TextEncoder().encode(replacementText);
const ownTempPath = "/sandbox/.payrun-store.json.tmp.instance-1.operation-1";

function options(
  fileSystem: LocalJsonFileSystem,
  overrides: Partial<Parameters<typeof atomicReplaceLocalJsonStore>[0]> = {},
) {
  return {
    canonicalStorePath: storePath,
    instanceId: "instance-1",
    operationId: "operation-1",
    serializedEnvelope: replacementText,
    committedGeneration: 5,
    assertWriterLeaseOwned: async () => undefined,
    fileSystem,
    ...overrides,
  };
}

describe("atomic Local JSON replacement", () => {
  it("writes, syncs, closes, rechecks the lease, renames, and syncs the directory in order", async () => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.files.set(storePath, originalBytes);
    const leaseCheck = async () => {
      fileSystem.events.push("lease recheck");
    };

    await atomicReplaceLocalJsonStore(options(fileSystem, { assertWriterLeaseOwned: leaseCheck }));

    expect(fileSystem.events).toEqual([
      `open temp ${ownTempPath}`,
      "write temp",
      "fsync temp",
      "close temp",
      "lease recheck",
      `rename ${ownTempPath} ${storePath}`,
      "open directory /sandbox",
      "fsync directory",
      "close directory",
    ]);
    expect(fileSystem.files.get(storePath)).toEqual(replacementBytes);
  });

  it.each([
    ["open_temp", "open_temp"],
    ["write_temp", "write_temp"],
    ["fsync_temp", "fsync_temp"],
    ["close_temp", "close_temp"],
    ["rename", "rename"],
  ] as const)("preserves the original bytes when %s fails", async (failure, expectedStage) => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.failure = failure;
    fileSystem.files.set(storePath, originalBytes);
    fileSystem.files.set("/sandbox/.payrun-store.json.tmp.foreign.old", new TextEncoder().encode("old"));

    await expect(atomicReplaceLocalJsonStore(options(fileSystem))).rejects.toMatchObject({
      code: "atomic_store_write_failed",
      stage: expectedStage,
    });

    expect(fileSystem.files.get(storePath)).toEqual(originalBytes);
    expect(fileSystem.files.has(ownTempPath)).toBe(false);
    expect(fileSystem.files.get("/sandbox/.payrun-store.json.tmp.foreign.old")).toEqual(
      new TextEncoder().encode("old"),
    );
    expect(fileSystem.events).not.toContain("open directory /sandbox");
  });

  it("detects an incomplete write and preserves the original store", async () => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.partialWriteThenFail = true;
    fileSystem.files.set(storePath, originalBytes);

    await expect(atomicReplaceLocalJsonStore(options(fileSystem))).rejects.toMatchObject({
      code: "atomic_store_write_failed",
      stage: "write_temp",
    });
    expect(fileSystem.files.get(storePath)).toEqual(originalBytes);
    expect(fileSystem.files.has(ownTempPath)).toBe(false);
  });

  it("does not rename after the pre-rename lease recheck reports lease loss", async () => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.files.set(storePath, originalBytes);

    await expect(
      atomicReplaceLocalJsonStore(
        options(fileSystem, {
          assertWriterLeaseOwned: async () => {
            throw new LeaseLostError(storePath);
          },
        }),
      ),
    ).rejects.toBeInstanceOf(LeaseLostError);

    expect(fileSystem.files.get(storePath)).toEqual(originalBytes);
    expect(fileSystem.files.has(ownTempPath)).toBe(false);
    expect(fileSystem.events.some((event) => event.startsWith("rename "))).toBe(false);
  });

  it("keeps the original stage error when cleanup of its own temp also fails", async () => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.files.set(storePath, originalBytes);
    fileSystem.failure = "cleanup_temp";
    const leaseFailure = new LeaseLostError(storePath);

    await expect(
      atomicReplaceLocalJsonStore(
        options(fileSystem, {
          assertWriterLeaseOwned: async () => {
            throw leaseFailure;
          },
        }),
      ),
    ).rejects.toBe(leaseFailure);
    expect(fileSystem.files.get(storePath)).toEqual(originalBytes);
  });

  it.each(["EINVAL", "ENOTSUP", "EISDIR"])(
    "records %s as an unsupported directory fsync diagnostic and succeeds",
    async (code) => {
      const fileSystem = new MemoryFileSystem();
      fileSystem.failure = "fsync_directory";
      fileSystem.directoryErrorCode = code;
      fileSystem.files.set(storePath, originalBytes);
      const diagnostics: unknown[] = [];

      await atomicReplaceLocalJsonStore(
        options(fileSystem, { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) }),
      );

      expect(fileSystem.files.get(storePath)).toEqual(replacementBytes);
      expect(diagnostics).toEqual([
        expect.objectContaining({
          kind: "directory_fsync_unsupported",
          code,
          directoryPath: "/sandbox",
        }),
      ]);
    },
  );

  it.each(["open_directory", "fsync_directory", "close_directory"] as const)(
    "reports renamed-but-unconfirmed durability when %s fails",
    async (failure) => {
      const fileSystem = new MemoryFileSystem();
      fileSystem.failure = failure;
      fileSystem.files.set(storePath, originalBytes);

      const promise = atomicReplaceLocalJsonStore(options(fileSystem));
      await expect(promise).rejects.toMatchObject({
        code: "store_durability_unconfirmed",
        commitState: "renamed_not_durably_confirmed",
        committedGeneration: 5,
      });
      await expect(promise).rejects.toBeInstanceOf(StoreDurabilityError);
      expect(fileSystem.files.get(storePath)).toEqual(replacementBytes);
    },
  );

  it("production filesystem publishes a complete envelope and leaves old temp files untouched", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zenfix-atomic-write-"));
    const canonicalStorePath = join(directory, "payrun-store.json");
    const foreignTempPath = join(directory, ".payrun-store.json.tmp.foreign.old");
    await writeFile(canonicalStorePath, originalBytes);
    await writeFile(foreignTempPath, "foreign-temp");

    await atomicReplaceLocalJsonStore({
      ...options(nodeLocalJsonFileSystem),
      canonicalStorePath,
    });

    expect(await readFile(canonicalStorePath, "utf8")).toBe(replacementText);
    expect(await readFile(foreignTempPath, "utf8")).toBe("foreign-temp");
    expect(dirname(canonicalStorePath)).toBe(directory);
  });

  it("uses explicit AtomicStoreWriteError instances for pre-rename I/O failures", async () => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.failure = "open_temp";

    await expect(atomicReplaceLocalJsonStore(options(fileSystem))).rejects.toBeInstanceOf(
      AtomicStoreWriteError,
    );
  });
});
