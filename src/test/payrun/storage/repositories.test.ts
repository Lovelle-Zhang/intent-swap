import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AdapterClosedError,
  AppendOnlyViolationError,
  DuplicateRecordError,
  openLocalJsonPayRunStorage,
} from "@/features/payrun/adapters/storage";
import { openLocalJsonPayRunStorageWithDependencies } from "@/features/payrun/adapters/storage/local-json-storage";
import { writerLeasePathFor } from "@/features/payrun/adapters/storage/writer-lease";
import { ProjectScopeError, VersionConflictError } from "@/features/payrun/domain/errors";
import type { LocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import type { LedgerJournal, PayRun } from "@/features/payrun/domain/types";
import {
  buildApproval,
  buildAuditEvent,
  buildFundingPreparation,
  buildIdempotencyRecord,
  buildLedgerJournal,
  buildOutboxEvent,
  buildPaymentExecution,
  buildPayRunAt,
  OTHER_PROJECT_ID,
  PAY_RUN_ID,
  PROJECT_ID,
  UPDATED_AT,
} from "@/test/payrun/domain/fixtures";
import { buildInboxEventFixture, buildStoreEnvelopeFixture } from "@/test/payrun/storage/fixtures";

const roots: string[] = [];
const handles: LocalJsonPayRunStorage[] = [];

async function tempStore(name = "payrun-store.json") {
  const root = await mkdtemp(join(tmpdir(), "zenfix-storage-repositories-"));
  roots.push(root);
  return { root, storePath: join(root, name) };
}

async function openStorage(storePath: string): Promise<LocalJsonPayRunStorage> {
  const storage = await openLocalJsonPayRunStorage({
    storePath,
    now: () => "2026-07-13T08:00:00.000Z",
  });
  handles.push(storage);
  return storage;
}

function nextPayRun(current: PayRun, version: number): PayRun {
  return { ...current, version, updatedAt: UPDATED_AT };
}

function versionOnePayRun(): PayRun {
  return { ...buildPayRunAt("intent_recorded"), version: 1 };
}

function reidentifyJournal(
  journal: LedgerJournal,
  id: string,
  overrides: Partial<LedgerJournal> = {},
): LedgerJournal {
  return {
    ...journal,
    id,
    entries: journal.entries.map((entry) => ({ ...entry, journalId: id })),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Local JSON storage lifecycle", () => {
  it("initializes an absent store as an empty generation-0 envelope", async () => {
    const { storePath } = await tempStore();

    const storage = await openStorage(storePath);
    const envelope = JSON.parse(await readFile(storePath, "utf8"));

    expect(storage.canonicalStorePath).toBe(join(await realpath(join(storePath, "..")), "payrun-store.json"));
    await expect(storage.getStoreGeneration()).resolves.toBe(0);
    expect(envelope.storeGeneration).toBe(0);
    expect(Object.values(envelope.payload)).toEqual(Array(9).fill([]));
    expect(envelope.envelopeChecksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not reinitialize or overwrite an existing corrupt store", async () => {
    const { storePath } = await tempStore();
    const corrupt = "{ definitely-not-json";
    await writeFile(storePath, corrupt, "utf8");

    await expect(openLocalJsonPayRunStorage({ storePath })).rejects.toMatchObject({
      code: "store_corrupt",
      reason: "malformed_json",
    });
    await expect(readFile(storePath, "utf8")).resolves.toBe(corrupt);
  });

  it("shares one coordinator, queue, lease, and reference count across canonical aliases", async () => {
    const { root, storePath } = await tempStore();
    const alias = `${root}-alias`;
    roots.push(alias);
    await symlink(root, alias, "dir");

    const first = await openStorage(storePath);
    const second = await openStorage(join(alias, "payrun-store.json"));
    expect(second.canonicalStorePath).toBe(first.canonicalStorePath);

    await first.close();
    expect(await readFile(writerLeasePathFor(storePath), "utf8")).toContain(storePath);
    await expect(second.getStoreGeneration()).resolves.toBe(0);

    await second.close();
    await expect(readFile(writerLeasePathFor(storePath), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps a concurrent open valid while the previous final handle is closing", async () => {
    const { storePath } = await tempStore();
    let allowRelease!: () => void;
    let releaseStarted!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      allowRelease = resolve;
    });
    const releaseEntered = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    const first = await openLocalJsonPayRunStorageWithDependencies(
      { storePath, now: () => "2026-07-13T08:00:00.000Z" },
      {
        beforeFinalLeaseRelease: async () => {
          releaseStarted();
          await releaseGate;
        },
      },
    );
    handles.push(first);

    const closing = first.close();
    await releaseEntered;
    const reopening = openStorage(storePath);
    allowRelease();

    await closing;
    const reopened = await reopening;
    await expect(reopened.getStoreGeneration()).resolves.toBe(0);
    await expect(readFile(writerLeasePathFor(storePath), "utf8")).resolves.toContain(
      reopened.canonicalStorePath,
    );
  });

  it("rejects every operation made through a closed handle", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    await storage.close();

    await expect(storage.getStoreGeneration()).rejects.toBeInstanceOf(AdapterClosedError);
    await expect(storage.payRuns.get(PROJECT_ID, PAY_RUN_ID)).rejects.toBeInstanceOf(
      AdapterClosedError,
    );
    await expect(storage.close()).resolves.toBeUndefined();
  });

  it("persists records across final close and restart without seed data", async () => {
    const { storePath } = await tempStore();
    const first = await openStorage(storePath);
    const payRun = buildPayRunAt("intent_recorded");
    await first.payRuns.insert(PROJECT_ID, payRun);
    await first.close();

    const restarted = await openStorage(storePath);
    await expect(restarted.payRuns.get(PROJECT_ID, payRun.id)).resolves.toEqual(payRun);
    await expect(restarted.getStoreGeneration()).resolves.toBe(1);
  });

  it("exposes every canonical repository and Unit of Work property", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);

    expect(storage).toMatchObject({
      payRuns: expect.any(Object),
      approvals: expect.any(Object),
      fundingPreparations: expect.any(Object),
      paymentExecutions: expect.any(Object),
      ledger: expect.any(Object),
      auditEvents: expect.any(Object),
      domainOutbox: expect.any(Object),
      idempotency: expect.any(Object),
      inbox: expect.any(Object),
      unitOfWork: expect.any(Object),
    });
  });
});

describe("project-scoped repositories", () => {
  it("round-trips a PayRun while isolating caller-owned and returned objects", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const payRun = buildPayRunAt("intent_recorded");

    await storage.payRuns.insert(PROJECT_ID, payRun);
    (payRun.intent as { purpose: string }).purpose = "caller mutation";

    const loaded = await storage.payRuns.get(PROJECT_ID, payRun.id);
    expect(loaded).not.toBe(payRun);
    expect(loaded?.intent.purpose).toBe("Purchase a verified API result");
    (loaded!.intent as { purpose: string }).purpose = "returned mutation";
    await expect(storage.payRuns.get(PROJECT_ID, payRun.id)).resolves.toMatchObject({
      intent: { purpose: "Purchase a verified API result" },
    });
  });

  it("does not disclose records across projects and rejects mismatched writes", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const payRun = buildPayRunAt("intent_recorded");
    await storage.payRuns.insert(PROJECT_ID, payRun);
    const approval = buildApproval();
    const funding = buildFundingPreparation();
    const payment = buildPaymentExecution();
    const journal = buildLedgerJournal();
    const audit = buildAuditEvent({ sequence: 1, beforeVersion: 0, afterVersion: 1 });
    const outbox = buildOutboxEvent({
      sequence: 1,
      aggregateVersion: 1,
      eventType: "payrun.created",
      payload: { payRunId: PAY_RUN_ID, afterVersion: 1 },
    });
    const idempotency = buildIdempotencyRecord();
    const inbox = buildInboxEventFixture();
    await storage.approvals.insert(PROJECT_ID, approval);
    await storage.fundingPreparations.insert(PROJECT_ID, funding);
    await storage.paymentExecutions.insert(PROJECT_ID, payment);
    await storage.ledger.append(PROJECT_ID, journal);
    await storage.auditEvents.append(PROJECT_ID, audit);
    await storage.domainOutbox.append(PROJECT_ID, outbox);
    await storage.idempotency.insert(PROJECT_ID, idempotency);
    await storage.inbox.insert(PROJECT_ID, inbox);

    await expect(storage.payRuns.get(OTHER_PROJECT_ID, payRun.id)).resolves.toBeNull();
    await expect(storage.payRuns.list(OTHER_PROJECT_ID)).resolves.toEqual([]);
    await expect(storage.approvals.get(OTHER_PROJECT_ID, approval.id)).resolves.toBeNull();
    await expect(storage.fundingPreparations.get(OTHER_PROJECT_ID, funding.id)).resolves.toBeNull();
    await expect(storage.paymentExecutions.get(OTHER_PROJECT_ID, payment.id)).resolves.toBeNull();
    await expect(storage.ledger.get(OTHER_PROJECT_ID, journal.id)).resolves.toBeNull();
    await expect(
      storage.ledger.findByProof(OTHER_PROJECT_ID, journal.executionProofId),
    ).resolves.toBeNull();
    await expect(
      storage.ledger.findByExternalReference(OTHER_PROJECT_ID, journal.externalReference),
    ).resolves.toBeNull();
    await expect(storage.auditEvents.list(OTHER_PROJECT_ID, audit.payRunId)).resolves.toEqual([]);
    await expect(storage.domainOutbox.get(OTHER_PROJECT_ID, outbox.id)).resolves.toBeNull();
    await expect(
      storage.idempotency.get(OTHER_PROJECT_ID, idempotency.commandType, idempotency.key),
    ).resolves.toBeNull();
    await expect(
      storage.inbox.get(OTHER_PROJECT_ID, inbox.source, inbox.sourceEventId),
    ).resolves.toBeNull();

    const mismatches = [
      storage.payRuns.insert(OTHER_PROJECT_ID, buildPayRunAt("intent_recorded")),
      storage.approvals.insert(OTHER_PROJECT_ID, buildApproval()),
      storage.fundingPreparations.insert(OTHER_PROJECT_ID, buildFundingPreparation()),
      storage.paymentExecutions.insert(OTHER_PROJECT_ID, buildPaymentExecution()),
      storage.ledger.append(OTHER_PROJECT_ID, buildLedgerJournal()),
      storage.auditEvents.append(OTHER_PROJECT_ID, buildAuditEvent()),
      storage.domainOutbox.append(OTHER_PROJECT_ID, buildOutboxEvent()),
      storage.idempotency.insert(OTHER_PROJECT_ID, buildIdempotencyRecord()),
      storage.inbox.insert(OTHER_PROJECT_ID, buildInboxEventFixture()),
    ];
    for (const mismatch of mismatches) {
      await expect(mismatch).rejects.toBeInstanceOf(ProjectScopeError);
    }
    await expect(storage.getStoreGeneration()).resolves.toBe(9);
  });

  it("rejects duplicate project-scoped identities without advancing generation", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const payRun = buildPayRunAt("intent_recorded");
    await storage.payRuns.insert(PROJECT_ID, payRun);

    await expect(storage.payRuns.insert(PROJECT_ID, payRun)).rejects.toBeInstanceOf(
      DuplicateRecordError,
    );
    await expect(storage.getStoreGeneration()).resolves.toBe(1);
  });
});

describe("PayRun compare-and-set", () => {
  it("validates expected version/status and retains aggregate identity", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const current = versionOnePayRun();
    await storage.payRuns.insert(PROJECT_ID, current);

    await expect(
      storage.payRuns.compareAndSet(
        PROJECT_ID,
        current.id,
        1,
        "intent_recorded",
        nextPayRun(current, 2),
      ),
    ).resolves.toEqual({ kind: "updated", value: nextPayRun(current, 2) });

    await expect(
      storage.payRuns.compareAndSet(
        PROJECT_ID,
        current.id,
        1,
        "intent_recorded",
        nextPayRun(current, 2),
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const persisted = await storage.payRuns.get(PROJECT_ID, current.id);
    await expect(
      storage.payRuns.compareAndSet(
        PROJECT_ID,
        current.id,
        2,
        "policy_evaluating",
        nextPayRun(persisted!, 3),
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);
    await expect(storage.getStoreGeneration()).resolves.toBe(2);
  });

  it("rejects changed identity, invalid next version, and non-canonical next records", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const current = versionOnePayRun();
    await storage.payRuns.insert(PROJECT_ID, current);

    const invalidNextRecords: PayRun[] = [
      { ...current, id: "payrun_changed", version: 2 },
      { ...current, projectId: OTHER_PROJECT_ID, version: 2 },
      { ...current, version: 3 },
      { ...current, version: 2, status: "completed" },
    ];
    for (const next of invalidNextRecords) {
      await expect(
        storage.payRuns.compareAndSet(
          PROJECT_ID,
          current.id,
          1,
          "intent_recorded",
          next,
        ),
      ).rejects.toBeInstanceOf(Error);
    }
    await expect(storage.getStoreGeneration()).resolves.toBe(1);
  });

  it("serializes two instances so only one equal-version CAS commits", async () => {
    const { storePath } = await tempStore();
    const first = await openStorage(storePath);
    const second = await openStorage(storePath);
    const current = versionOnePayRun();
    await first.payRuns.insert(PROJECT_ID, current);

    const results = await Promise.allSettled([
      first.payRuns.compareAndSet(PROJECT_ID, current.id, 1, current.status, nextPayRun(current, 2)),
      second.payRuns.compareAndSet(PROJECT_ID, current.id, 1, current.status, nextPayRun(current, 2)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(VersionConflictError) });
    await expect(first.payRuns.get(PROJECT_ID, current.id)).resolves.toMatchObject({ version: 2 });
    await expect(first.getStoreGeneration()).resolves.toBe(2);
  });

  it("persists two queued updates with sequential expected versions", async () => {
    const { storePath } = await tempStore();
    const first = await openStorage(storePath);
    const second = await openStorage(storePath);
    const version1 = versionOnePayRun();
    const version2 = nextPayRun(version1, 2);
    const version3 = nextPayRun(version2, 3);
    await first.payRuns.insert(PROJECT_ID, version1);

    await Promise.all([
      first.payRuns.compareAndSet(PROJECT_ID, version1.id, 1, version1.status, version2),
      second.payRuns.compareAndSet(PROJECT_ID, version1.id, 2, version2.status, version3),
    ]);

    await expect(first.payRuns.get(PROJECT_ID, version1.id)).resolves.toMatchObject({ version: 3 });
    await expect(first.getStoreGeneration()).resolves.toBe(3);
  });

  it("loads a valid pre-existing envelope instead of initializing over it", async () => {
    const { storePath } = await tempStore();
    const envelope = buildStoreEnvelopeFixture();
    await writeFile(storePath, JSON.stringify(envelope), "utf8");

    const storage = await openStorage(storePath);
    await expect(storage.getStoreGeneration()).resolves.toBe(0);
  });
});

describe("append-only persistence", () => {
  it("persists continuous Audit lineage across restart and rejects every history rewrite", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const first = buildAuditEvent({
      id: "audit_001",
      sequence: 1,
      beforeVersion: 0,
      afterVersion: 1,
    });
    const second = buildAuditEvent({
      id: "audit_002",
      sequence: 2,
      beforeVersion: 1,
      afterVersion: 2,
    });

    await storage.auditEvents.append(PROJECT_ID, first);
    await storage.auditEvents.append(PROJECT_ID, second);
    await storage.close();

    const restarted = await openStorage(storePath);
    await expect(restarted.auditEvents.list(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual([
      first,
      second,
    ]);

    const rewrites = [
      buildAuditEvent({ ...second, details: { replaced: true } }),
      buildAuditEvent({ id: "audit_gap", sequence: 4, beforeVersion: 2, afterVersion: 3 }),
      buildAuditEvent({ id: "audit_before_gap", sequence: 3, beforeVersion: 0, afterVersion: 1 }),
      buildAuditEvent({
        id: first.id,
        payRunId: "payrun_other",
        aggregateId: "payrun_other",
        sequence: 1,
        beforeVersion: 0,
        afterVersion: 1,
      }),
    ];
    for (const rewrite of rewrites) {
      await expect(restarted.auditEvents.append(PROJECT_ID, rewrite)).rejects.toBeInstanceOf(
        AppendOnlyViolationError,
      );
    }
    await expect(restarted.getStoreGeneration()).resolves.toBe(2);
    await expect(restarted.auditEvents.list(PROJECT_ID, PAY_RUN_ID)).resolves.toEqual([
      first,
      second,
    ]);
  });

  it("persists continuous Outbox lineage and prevents payload replacement", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const first = buildOutboxEvent({
      id: "outbox_001",
      sequence: 1,
      aggregateVersion: 1,
      eventType: "payrun.created",
      payload: { payRunId: PAY_RUN_ID, afterVersion: 1 },
    });
    const second = buildOutboxEvent({
      id: "outbox_002",
      sequence: 2,
      aggregateVersion: 2,
      payload: { payRunId: PAY_RUN_ID, beforeVersion: 1, afterVersion: 2 },
    });

    await storage.domainOutbox.append(PROJECT_ID, first);
    await storage.domainOutbox.append(PROJECT_ID, second);
    await storage.close();

    const restarted = await openStorage(storePath);
    await expect(restarted.domainOutbox.get(PROJECT_ID, first.id)).resolves.toEqual(first);
    await expect(restarted.domainOutbox.get(PROJECT_ID, second.id)).resolves.toEqual(second);

    const rewrites = [
      buildOutboxEvent({ ...second, payload: { payRunId: PAY_RUN_ID, afterVersion: 2, replaced: true } }),
      buildOutboxEvent({ id: "outbox_gap", sequence: 4, aggregateVersion: 3 }),
      buildOutboxEvent({
        id: "outbox_payload_mismatch",
        sequence: 3,
        aggregateVersion: 3,
        payload: { payRunId: "payrun_other", afterVersion: 3 },
      }),
      buildOutboxEvent({
        id: first.id,
        aggregateId: "payrun_other",
        sequence: 1,
        aggregateVersion: 1,
        payload: { payRunId: "payrun_other", afterVersion: 1 },
      }),
    ];
    for (const rewrite of rewrites) {
      await expect(restarted.domainOutbox.append(PROJECT_ID, rewrite)).rejects.toBeInstanceOf(
        AppendOnlyViolationError,
      );
    }
    await expect(restarted.getStoreGeneration()).resolves.toBe(2);
    await expect(restarted.domainOutbox.get(PROJECT_ID, second.id)).resolves.toEqual(second);
  });
});

describe("repository business-key uniqueness", () => {
  it("enforces project-scoped Ledger proof and external-reference uniqueness", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const journal = buildLedgerJournal();
    await storage.ledger.append(PROJECT_ID, journal);

    await expect(
      storage.ledger.append(PROJECT_ID, reidentifyJournal(journal, "ledger_same_proof")),
    ).rejects.toBeInstanceOf(AppendOnlyViolationError);
    await expect(
      storage.ledger.append(
        PROJECT_ID,
        reidentifyJournal(journal, "ledger_same_external", { executionProofId: "proof_other" }),
      ),
    ).rejects.toBeInstanceOf(AppendOnlyViolationError);

    await expect(storage.getStoreGeneration()).resolves.toBe(1);
    await expect(storage.ledger.findByProof(PROJECT_ID, journal.executionProofId)).resolves.toEqual(
      journal,
    );
  });

  it("enforces idempotency and Inbox business keys without advancing generation", async () => {
    const { storePath } = await tempStore();
    const storage = await openStorage(storePath);
    const idempotency = buildIdempotencyRecord();
    const inbox = buildInboxEventFixture();
    await storage.idempotency.insert(PROJECT_ID, idempotency);
    await storage.inbox.insert(PROJECT_ID, inbox);

    await expect(
      storage.idempotency.insert(
        PROJECT_ID,
        buildIdempotencyRecord({ id: "idempotency_same_scope" }),
      ),
    ).rejects.toBeInstanceOf(DuplicateRecordError);
    await expect(
      storage.inbox.insert(PROJECT_ID, buildInboxEventFixture({ id: "inbox_same_source_event" })),
    ).rejects.toBeInstanceOf(DuplicateRecordError);

    await expect(storage.getStoreGeneration()).resolves.toBe(2);
    await expect(
      storage.idempotency.get(PROJECT_ID, idempotency.commandType, idempotency.key),
    ).resolves.toEqual(idempotency);
    await expect(storage.inbox.get(PROJECT_ID, inbox.source, inbox.sourceEventId)).resolves.toEqual(
      inbox,
    );
  });
});
