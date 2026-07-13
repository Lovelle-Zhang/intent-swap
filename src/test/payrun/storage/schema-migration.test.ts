import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Canonical } from "@/features/payrun/adapters/storage/canonical-json";
import { openLocalJsonPayRunStorage, type LocalJsonPayRunStorage } from "@/features/payrun/adapters/storage";
import { buildEmptyStorePayloadFixture } from "@/test/payrun/storage/fixtures";

const roots: string[] = [];
const handles: LocalJsonPayRunStorage[] = [];

afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Local JSON v1 to v2 migration", () => {
  it("validates and atomically migrates a checksummed v1 envelope once", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-store-migration-"));
    roots.push(root);
    const storePath = join(root, "store.json");
    const payload = buildEmptyStorePayloadFixture();
    const legacyPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "budgetReservations"));
    const content = {
      schemaVersion: 1,
      storeGeneration: 7,
      writtenAt: "2026-07-13T08:00:00.000Z",
      payload: legacyPayload,
    };
    await writeFile(storePath, JSON.stringify({ ...content, envelopeChecksum: sha256Canonical(content) }), "utf8");

    const storage = await openLocalJsonPayRunStorage({ storePath, now: () => "2026-07-13T09:00:00.000Z" });
    handles.push(storage);
    const migrated = JSON.parse(await readFile(storePath, "utf8"));

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.storeGeneration).toBe(8);
    expect(migrated.payload.budgetReservations).toEqual([]);
    await expect(storage.getStoreGeneration()).resolves.toBe(8);
  });

  it("does not migrate or overwrite a v1 checksum mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "zenfix-store-migration-"));
    roots.push(root);
    const storePath = join(root, "store.json");
    const bytes = JSON.stringify({
      schemaVersion: 1,
      storeGeneration: 7,
      writtenAt: "2026-07-13T08:00:00.000Z",
      payload: {},
      envelopeChecksum: "0".repeat(64),
    });
    await writeFile(storePath, bytes, "utf8");

    await expect(openLocalJsonPayRunStorage({ storePath })).rejects.toMatchObject({
      code: "store_corrupt",
      reason: "checksum_mismatch",
    });
    await expect(readFile(storePath, "utf8")).resolves.toBe(bytes);
  });
});
