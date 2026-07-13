import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openLocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import {
  SANDBOX_PROJECT_ID,
  createDeterministicSandboxControlLoop,
} from "@/features/payrun/adapters/sandbox";
import { IdempotencyConflictError, InvariantViolationError } from "@/features/payrun/domain/errors";

const baseCommand = {
  projectId: SANDBOX_PROJECT_ID,
  scenarioId: "allowed" as const,
  idempotencyKey: "scenario:restart",
  correlationId: "correlation:restart",
  requester: { actorId: "sandbox_agent_owner", actorType: "agent" as const },
};

describe("Sandbox Control Loop idempotency and restart", () => {
  it("replays byte-equivalent committed state after restart without writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-control-restart-"));
    const storePath = join(root, "store.json");
    try {
      const firstStorage = await openLocalJsonPayRunStorage({ storePath });
      const first = await createDeterministicSandboxControlLoop(firstStorage).execute(baseCommand);
      const generation = await firstStorage.getStoreGeneration();
      await firstStorage.close();

      const restarted = await openLocalJsonPayRunStorage({ storePath });
      const replay = await createDeterministicSandboxControlLoop(restarted).execute(baseCommand);
      expect(replay.payRun).toEqual(first.payRun);
      expect(replay.reservation).toEqual(first.reservation);
      await expect(restarted.getStoreGeneration()).resolves.toBe(generation);
      await expect(restarted.domainOutbox.get(
        SANDBOX_PROJECT_ID,
        `outbox_${first.payRun.id}_${first.payRun.lastOutboxSequence}`,
      )).resolves.toMatchObject({ aggregateVersion: first.payRun.version });
      await restarted.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects reuse of a root key with a different canonical request without a write", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-control-conflict-"));
    try {
      const storage = await openLocalJsonPayRunStorage({ storePath: join(root, "store.json") });
      await createDeterministicSandboxControlLoop(storage).execute(baseCommand);
      const generation = await storage.getStoreGeneration();

      await expect(createDeterministicSandboxControlLoop(storage).execute({
        ...baseCommand,
        scenarioId: "funding_mismatch",
      })).rejects.toBeInstanceOf(IdempotencyConflictError);
      await expect(storage.getStoreGeneration()).resolves.toBe(generation);
      await storage.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a project outside the fixed Sandbox catalog before persistence", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-control-project-"));
    try {
      const storage = await openLocalJsonPayRunStorage({ storePath: join(root, "store.json") });
      await expect(createDeterministicSandboxControlLoop(storage).execute({
        ...baseCommand,
        projectId: "project_other",
      })).rejects.toBeInstanceOf(InvariantViolationError);
      await expect(storage.getStoreGeneration()).resolves.toBe(0);
      await storage.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
