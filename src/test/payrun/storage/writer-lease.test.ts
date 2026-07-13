import { chmod, mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import { LeaseLostError, StoreLockedError, StorePathError } from "@/features/payrun/adapters/storage/errors";
import {
  acquireWriterLease,
  canonicalizeStorePath,
  writerLeasePathFor,
  type ProcessProbe,
} from "@/features/payrun/adapters/storage/writer-lease";

const children = new Set<ChildProcess>();

afterEach(() => {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
});

async function makeStorePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zenfix-writer-lease-"));
  return join(directory, "payrun-store.json");
}

function metadata(canonicalStorePath: string, overrides: Record<string, unknown> = {}) {
  return {
    pid: process.pid,
    hostname: hostname(),
    instanceId: "existing-instance",
    createdAt: "2026-07-13T08:00:00.000Z",
    canonicalStorePath,
    ...overrides,
  };
}

async function writeLock(canonicalStorePath: string, value: unknown): Promise<void> {
  await writeFile(writerLeasePathFor(canonicalStorePath), JSON.stringify(value), { flag: "wx" });
}

describe("canonicalizeStorePath", () => {
  test("converges symlink parent aliases on one canonical store and lock path", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-path-alias-"));
    const realParent = join(root, "real");
    const aliasParent = join(root, "alias");
    await mkdir(realParent);
    await symlink(realParent, aliasParent, "dir");

    const direct = await canonicalizeStorePath(join(realParent, "store.json"));
    const aliased = await canonicalizeStorePath(join(aliasParent, ".", "store.json"));

    expect(aliased).toBe(direct);
    expect(writerLeasePathFor(aliased)).toBe(writerLeasePathFor(direct));
  });

  test("rejects a missing parent without creating a lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-path-missing-"));
    const storePath = join(root, "missing", "store.json");

    await expect(canonicalizeStorePath(storePath)).rejects.toBeInstanceOf(StorePathError);
    await expect(readFile(`${storePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("rejects an unreadable parent path", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-path-unreadable-"));
    const notDirectory = join(root, "file");
    await writeFile(notDirectory, "not a directory");

    await expect(canonicalizeStorePath(join(notDirectory, "store.json"))).rejects.toBeInstanceOf(
      StorePathError,
    );
  });

  test("wraps parent permission errors as StorePathError", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-path-permission-"));
    const parent = join(root, "private");
    await mkdir(parent, { mode: 0o700 });
    await chmod(parent, 0o000);

    try {
      await expect(canonicalizeStorePath(join(parent, "store.json"))).rejects.toBeInstanceOf(
        StorePathError,
      );
    } finally {
      await chmod(parent, 0o700);
    }
  });
});

describe("writer lease", () => {
  test("uses exclusive acquisition and fails fast for an active PID", async () => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    const first = await acquireWriterLease({ canonicalStorePath, instanceId: "first" });

    await expect(
      acquireWriterLease({ canonicalStorePath, instanceId: "second" }),
    ).rejects.toBeInstanceOf(StoreLockedError);

    await first.release();
  });

  test("recovers only a same-host lock whose PID probe returns ESRCH", async () => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    await writeLock(canonicalStorePath, metadata(canonicalStorePath, { pid: 999_999_999 }));
    const probeProcess: ProcessProbe = () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    };

    const lease = await acquireWriterLease({
      canonicalStorePath,
      instanceId: "replacement",
      probeProcess,
      nextOperationId: () => "stale-recovery",
    });

    expect(JSON.parse(await readFile(lease.lockPath, "utf8"))).toMatchObject({
      instanceId: "replacement",
      canonicalStorePath,
    });
    await lease.release();
  });

  test.each([
    ["EPERM", hostname(), "EPERM"],
    ["foreign host", "remote.example", "ESRCH"],
  ])("fails closed for %s ownership", async (_case, lockHostname, probeCode) => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    await writeLock(canonicalStorePath, metadata(canonicalStorePath, { hostname: lockHostname }));
    const probeProcess: ProcessProbe = () => {
      const error = new Error(probeCode) as NodeJS.ErrnoException;
      error.code = probeCode;
      throw error;
    };

    await expect(
      acquireWriterLease({ canonicalStorePath, instanceId: "replacement", probeProcess }),
    ).rejects.toBeInstanceOf(StoreLockedError);
    expect(JSON.parse(await readFile(writerLeasePathFor(canonicalStorePath), "utf8"))).toMatchObject({
      instanceId: "existing-instance",
    });
  });

  test.each([
    ["malformed JSON", "{"],
    ["invalid metadata", JSON.stringify({ pid: -1 })],
  ])("fails closed for %s", async (_case, contents) => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    await writeFile(writerLeasePathFor(canonicalStorePath), contents, { flag: "wx" });

    await expect(
      acquireWriterLease({ canonicalStorePath, instanceId: "replacement" }),
    ).rejects.toBeInstanceOf(StoreLockedError);
  });

  test("fails closed when lock metadata names a different canonical store", async () => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    await writeLock(
      canonicalStorePath,
      metadata(join(dirname(canonicalStorePath), "different-store.json"), { pid: 999_999_999 }),
    );
    const probeProcess: ProcessProbe = () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    };

    await expect(
      acquireWriterLease({ canonicalStorePath, instanceId: "replacement", probeProcess }),
    ).rejects.toBeInstanceOf(StoreLockedError);
    expect(JSON.parse(await readFile(writerLeasePathFor(canonicalStorePath), "utf8"))).toMatchObject({
      canonicalStorePath: join(dirname(canonicalStorePath), "different-store.json"),
    });
  });

  test("fails closed when the existing lock cannot be read as a file", async () => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    await mkdir(writerLeasePathFor(canonicalStorePath));

    await expect(
      acquireWriterLease({ canonicalStorePath, instanceId: "replacement" }),
    ).rejects.toBeInstanceOf(StoreLockedError);
  });

  test("detects a deleted lease", async () => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    const lease = await acquireWriterLease({ canonicalStorePath, instanceId: "owner" });
    await unlink(lease.lockPath);

    await expect(lease.assertOwned()).rejects.toBeInstanceOf(LeaseLostError);
    await expect(lease.release()).rejects.toBeInstanceOf(LeaseLostError);
  });

  test("asserts current ownership and never deletes a replacement lease", async () => {
    const canonicalStorePath = await canonicalizeStorePath(await makeStorePath());
    const lease = await acquireWriterLease({ canonicalStorePath, instanceId: "owner" });
    await lease.assertOwned();
    await chmod(lease.lockPath, 0o600);
    await writeFile(
      lease.lockPath,
      JSON.stringify(metadata(canonicalStorePath, { instanceId: "replacement" })),
    );

    await expect(lease.assertOwned()).rejects.toBeInstanceOf(LeaseLostError);
    await expect(lease.release()).rejects.toBeInstanceOf(LeaseLostError);
    expect(JSON.parse(await readFile(lease.lockPath, "utf8"))).toMatchObject({
      instanceId: "replacement",
    });
  });

  test("a second process fails fast while a child holds the real writer lease", async () => {
    const storePath = await makeStorePath();
    const storeBytes = "existing-store-bytes";
    await writeFile(storePath, storeBytes);
    const directory = dirname(storePath);
    const readyPath = join(directory, "ready");
    const releasePath = join(directory, "release");
    const child = spawn(
      process.execPath,
      ["./node_modules/vitest/vitest.mjs", "run", "src/test/payrun/storage/lease-holder.test.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ZENFIX_LEASE_HOLDER: "1",
          ZENFIX_STORE_PATH: storePath,
          ZENFIX_READY_PATH: readyPath,
          ZENFIX_RELEASE_PATH: releasePath,
        },
        stdio: "ignore",
      },
    );
    children.add(child);

    await expect.poll(async () => {
      try {
        return await readFile(readyPath, "utf8");
      } catch {
        return "not-ready";
      }
    }, { timeout: 8_000 }).toBe("ready");
    const canonicalStorePath = await canonicalizeStorePath(storePath);
    const startedAt = Date.now();
    await expect(
      acquireWriterLease({ canonicalStorePath, instanceId: "parent-writer" }),
    ).rejects.toBeInstanceOf(StoreLockedError);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(await readFile(storePath, "utf8")).toBe(storeBytes);

    await writeFile(releasePath, "release");
    await new Promise<void>((resolve, reject) => {
      child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`child exited ${code}`))));
      child.once("error", reject);
    });
    children.delete(child);
  }, 12_000);
});
