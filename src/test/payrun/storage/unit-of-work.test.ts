import { mkdtemp, readFile, readdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import { LeaseLostError } from "@/features/payrun/adapters/storage";
import type { CoordinatorDependencies } from "@/features/payrun/adapters/storage/coordinator";
import {
  nodeLocalJsonFileSystem,
  type LocalJsonFileHandle,
  type LocalJsonFileSystem,
} from "@/features/payrun/adapters/storage/local-json-file-system";
import { openLocalJsonPayRunStorageWithDependencies } from "@/features/payrun/adapters/storage/local-json-storage";
import { createStoreEnvelope } from "@/features/payrun/adapters/storage/store-envelope";
import { writerLeasePathFor } from "@/features/payrun/adapters/storage/writer-lease";
import { ProjectScopeError, VersionConflictError } from "@/features/payrun/domain/errors";
import type { PayRun } from "@/features/payrun/domain/types";
import {
  buildAuditEvent,
  buildIdempotencyRecord,
  buildOutboxEvent,
  buildPayRunAt,
  OTHER_PROJECT_ID,
  PAY_RUN_ID,
  PROJECT_ID,
  UPDATED_AT,
} from "@/test/payrun/domain/fixtures";

const roots: string[] = [];
const handles: LocalJsonPayRunStorage[] = [];

async function createStorage(dependencies: CoordinatorDependencies = {}) {
  const root = await mkdtemp(join(tmpdir(), "zenfix-storage-uow-"));
  roots.push(root);
  const storePath = join(root, "payrun-store.json");
  const storage = await openLocalJsonPayRunStorageWithDependencies(
    {
      storePath,
      now: () => "2026-07-13T08:00:00.000Z",
      nextOperationId: (() => {
        let operation = 0;
        return () => `operation-${++operation}`;
      })(),
    },
    { instanceId: () => `instance-${Math.random()}`, ...dependencies },
  );
  handles.push(storage);
  return { root, storePath, storage };
}

type AtomicFailure = "write_temp" | "fsync_temp" | "rename";

class FailingCommitFileSystem implements LocalJsonFileSystem {
  failure?: AtomicFailure;

  async open(path: string, flags: "wx" | "r", mode?: number): Promise<LocalJsonFileHandle> {
    const handle = await nodeLocalJsonFileSystem.open(path, flags, mode);
    if (flags !== "wx") return handle;
    return {
      write: async (...args) => {
        if (this.failure === "write_temp") throw new Error("injected temp write failure");
        return handle.write(...args);
      },
      sync: async () => {
        if (this.failure === "fsync_temp") throw new Error("injected temp fsync failure");
        return handle.sync();
      },
      close: () => handle.close(),
    };
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.failure === "rename") throw new Error("injected rename failure");
    await nodeLocalJsonFileSystem.rename(from, to);
  }

  unlink(path: string): Promise<void> {
    return nodeLocalJsonFileSystem.unlink(path);
  }
}

function initialPayRun(): PayRun {
  return {
    ...buildPayRunAt("intent_recorded"),
    version: 1,
    lastAuditSequence: 1,
    lastOutboxSequence: 1,
  };
}

function committedPayRun(current: PayRun): PayRun {
  return {
    ...current,
    version: 2,
    lastAuditSequence: 2,
    lastOutboxSequence: 2,
    updatedAt: UPDATED_AT,
  };
}

function committedAuditEvent() {
  return buildAuditEvent({
    id: "audit_002",
    sequence: 2,
    beforeVersion: 1,
    afterVersion: 2,
  });
}

function committedOutboxEvent() {
  return buildOutboxEvent({
    id: "outbox_002",
    sequence: 2,
    aggregateVersion: 2,
    payload: { payRunId: PAY_RUN_ID, beforeVersion: 1, afterVersion: 2 },
  });
}

function creationAuditEvent() {
  return buildAuditEvent({ id: "audit_001", sequence: 1, beforeVersion: 0, afterVersion: 1 });
}

function creationOutboxEvent() {
  return buildOutboxEvent({
    id: "outbox_001",
    sequence: 1,
    aggregateVersion: 1,
    eventType: "payrun.created",
    payload: { payRunId: PAY_RUN_ID, afterVersion: 1 },
  });
}

async function prepareBaseline(storage: LocalJsonPayRunStorage): Promise<PayRun> {
  const current = initialPayRun();
  await storage.payRuns.insert(PROJECT_ID, current);
  await storage.auditEvents.append(PROJECT_ID, creationAuditEvent());
  await storage.domainOutbox.append(PROJECT_ID, creationOutboxEvent());
  return current;
}

function committedIdempotencyRecord() {
  return buildIdempotencyRecord({
    id: "idempotency_001",
    key: "transition-idempotency-001",
    resultVersion: 2,
  });
}

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Local JSON PayRun Unit of Work", () => {
  it("commits PayRun CAS, idempotency, Audit, and Outbox with one generation", async () => {
    const { storage } = await createStorage();
    const current = await prepareBaseline(storage);
    const beforeGeneration = await storage.getStoreGeneration();

    const result = await storage.unitOfWork.execute(PROJECT_ID, async (context) => {
      const next = committedPayRun(current);
      await context.payRuns.compareAndSet(
        PROJECT_ID,
        current.id,
        current.version,
        current.status,
        next,
      );
      await context.idempotency.insert(PROJECT_ID, committedIdempotencyRecord());
      await context.auditEvents.append(PROJECT_ID, committedAuditEvent());
      await context.domainOutbox.append(PROJECT_ID, committedOutboxEvent());
      return "committed" as const;
    });

    expect(result).toBe("committed");
    await expect(storage.getStoreGeneration()).resolves.toBe(beforeGeneration + 1);
    await expect(storage.payRuns.get(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual(
      committedPayRun(current),
    );
    await expect(storage.auditEvents.list(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual([
      creationAuditEvent(), committedAuditEvent(),
    ]);
    await expect(storage.domainOutbox.get(PROJECT_ID, committedOutboxEvent().id)).resolves.toEqual(
      committedOutboxEvent(),
    );
    await expect(
      storage.idempotency.get(
        PROJECT_ID,
        committedIdempotencyRecord().commandType,
        committedIdempotencyRecord().key,
      ),
    ).resolves.toEqual(committedIdempotencyRecord());
  });

  it("binds every transaction repository call to the execute project", async () => {
    const { storage } = await createStorage();

    await expect(
      storage.unitOfWork.execute(PROJECT_ID, (context) =>
        context.payRuns.get(OTHER_PROJECT_ID, PAY_RUN_ID),
      ),
    ).rejects.toBeInstanceOf(ProjectScopeError);
    await expect(storage.getStoreGeneration()).resolves.toBe(0);
  });

  it.each([
    ["operation", async () => { throw new Error("operation failed"); }],
    ["CAS", async (context: Parameters<Parameters<LocalJsonPayRunStorage["unitOfWork"]["execute"]>[1]>[0]) => {
      await context.payRuns.compareAndSet(
        PROJECT_ID,
        PAY_RUN_ID,
        6,
        "intent_recorded",
        committedPayRun(initialPayRun()),
      );
    }],
    ["Audit append", async (context: Parameters<Parameters<LocalJsonPayRunStorage["unitOfWork"]["execute"]>[1]>[0]) => {
      await context.auditEvents.append(PROJECT_ID, buildAuditEvent({ sequence: 3 }));
    }],
    ["Outbox append", async (context: Parameters<Parameters<LocalJsonPayRunStorage["unitOfWork"]["execute"]>[1]>[0]) => {
      await context.domainOutbox.append(PROJECT_ID, buildOutboxEvent({ sequence: 3 }));
    }],
  ] as const)("rolls back all collections and bytes when %s fails", async (_label, fail) => {
    const { storePath, storage } = await createStorage();
    const current = await prepareBaseline(storage);
    const beforeBytes = await readFile(storePath, "utf8");
    const beforeGeneration = await storage.getStoreGeneration();

    await expect(
      storage.unitOfWork.execute(PROJECT_ID, async (context) => {
        await context.idempotency.insert(PROJECT_ID, committedIdempotencyRecord());
        await fail(context);
      }),
    ).rejects.toBeInstanceOf(Error);

    await expect(readFile(storePath, "utf8")).resolves.toBe(beforeBytes);
    await expect(storage.getStoreGeneration()).resolves.toBe(beforeGeneration);
    await expect(storage.payRuns.get(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual(current);
    await expect(storage.auditEvents.list(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual([
      creationAuditEvent(),
    ]);
    await expect(storage.domainOutbox.get(PROJECT_ID, creationOutboxEvent().id)).resolves.toEqual(
      creationOutboxEvent(),
    );
    await expect(storage.domainOutbox.get(PROJECT_ID, committedOutboxEvent().id)).resolves.toBeNull();
    await expect(
      storage.idempotency.get(
        PROJECT_ID,
        committedIdempotencyRecord().commandType,
        committedIdempotencyRecord().key,
      ),
    ).resolves.toBeNull();
  });

  it("does not create a temp file when the lease is lost after the callback", async () => {
    const { root, storePath, storage } = await createStorage();
    const beforeBytes = await readFile(storePath, "utf8");

    await expect(
      storage.unitOfWork.execute(PROJECT_ID, async (context) => {
        await context.payRuns.insert(PROJECT_ID, initialPayRun());
        await unlink(writerLeasePathFor(storePath));
      }),
    ).rejects.toBeInstanceOf(LeaseLostError);

    await expect(readFile(storePath, "utf8")).resolves.toBe(beforeBytes);
    expect((await readdir(root)).filter((name) => name.includes(".tmp."))).toEqual([]);
  });

  it("rolls back a stale CAS after earlier transaction writes", async () => {
    const { storePath, storage } = await createStorage();
    const current = await prepareBaseline(storage);
    const beforeBytes = await readFile(storePath, "utf8");

    await expect(
      storage.unitOfWork.execute(PROJECT_ID, async (context) => {
        await context.auditEvents.append(PROJECT_ID, committedAuditEvent());
        await context.payRuns.compareAndSet(
          PROJECT_ID,
          current.id,
          current.version - 1,
          current.status,
          committedPayRun(current),
        );
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    await expect(readFile(storePath, "utf8")).resolves.toBe(beforeBytes);
  });

  it("rolls back when final runtime validation rejects the memory working copy", async () => {
    const { storePath, storage } = await createStorage();
    const current = await prepareBaseline(storage);
    const beforeBytes = await readFile(storePath, "utf8");
    const beforeGeneration = await storage.getStoreGeneration();

    await expect(
      storage.unitOfWork.execute(PROJECT_ID, async (context) => {
        await context.payRuns.compareAndSet(
          PROJECT_ID,
          current.id,
          current.version,
          current.status,
          committedPayRun(current),
        );
        await context.inbox!.insert(PROJECT_ID, {
          id: "inbox_invalid",
          projectId: PROJECT_ID,
          version: 1,
          source: "sandbox_webhook",
          sourceEventId: "source_invalid",
          status: "received",
          payloadDigest: "sha256:invalid",
          createdAt: "not-a-timestamp",
          updatedAt: "not-a-timestamp",
        });
      }),
    ).rejects.toMatchObject({ code: "store_corrupt", reason: "runtime_schema_invalid" });

    await expect(readFile(storePath, "utf8")).resolves.toBe(beforeBytes);
    await expect(storage.getStoreGeneration()).resolves.toBe(beforeGeneration);
    await expect(storage.payRuns.get(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual(current);
  });

  it("rolls back when checksum/envelope creation fails", async () => {
    let failEnvelopeCreation = false;
    const { storePath, storage } = await createStorage({
      createEnvelope(payload, generation, writtenAt) {
        if (failEnvelopeCreation) throw new Error("injected checksum failure");
        return createStoreEnvelope(payload, generation, writtenAt);
      },
    });
    const current = await prepareBaseline(storage);
    const beforeBytes = await readFile(storePath, "utf8");
    const beforeGeneration = await storage.getStoreGeneration();
    failEnvelopeCreation = true;

    await expect(
      storage.unitOfWork.execute(PROJECT_ID, (context) =>
        context.payRuns.compareAndSet(
          PROJECT_ID,
          current.id,
          current.version,
          current.status,
          committedPayRun(current),
        ),
      ),
    ).rejects.toThrow("injected checksum failure");

    await expect(readFile(storePath, "utf8")).resolves.toBe(beforeBytes);
    await expect(storage.getStoreGeneration()).resolves.toBe(beforeGeneration);
  });

  it.each(["write_temp", "fsync_temp", "rename"] as const)(
    "rolls back all formal state when %s fails before rename",
    async (failure) => {
      const fileSystem = new FailingCommitFileSystem();
      const { storePath, storage } = await createStorage({ fileSystem });
      const current = await prepareBaseline(storage);
      const beforeBytes = await readFile(storePath, "utf8");
      const beforeGeneration = await storage.getStoreGeneration();
      fileSystem.failure = failure;

      await expect(
        storage.unitOfWork.execute(PROJECT_ID, async (context) => {
          await context.payRuns.compareAndSet(
            PROJECT_ID,
            current.id,
            current.version,
            current.status,
            committedPayRun(current),
          );
          await context.idempotency.insert(PROJECT_ID, committedIdempotencyRecord());
          await context.auditEvents.append(PROJECT_ID, committedAuditEvent());
          await context.domainOutbox.append(PROJECT_ID, committedOutboxEvent());
        }),
      ).rejects.toMatchObject({ code: "atomic_store_write_failed" });

      fileSystem.failure = undefined;
      await expect(readFile(storePath, "utf8")).resolves.toBe(beforeBytes);
      await expect(storage.getStoreGeneration()).resolves.toBe(beforeGeneration);
      await expect(storage.payRuns.get(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual(current);
      await expect(storage.auditEvents.list(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual([
        creationAuditEvent(),
      ]);
      await expect(storage.domainOutbox.get(PROJECT_ID, committedOutboxEvent().id)).resolves.toBeNull();
      await expect(
        storage.idempotency.get(
          PROJECT_ID,
          committedIdempotencyRecord().commandType,
          committedIdempotencyRecord().key,
        ),
      ).resolves.toBeNull();
    },
  );
});
