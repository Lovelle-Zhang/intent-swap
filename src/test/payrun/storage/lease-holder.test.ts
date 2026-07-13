import { access, writeFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  acquireWriterLease,
  canonicalizeStorePath,
} from "@/features/payrun/adapters/storage/writer-lease";

const enabled = process.env.ZENFIX_LEASE_HOLDER === "1";

describe.skipIf(!enabled)("writer lease child-process fixture", () => {
  test("holds the real lease until the parent signals release", async () => {
    const storePath = requireEnvironment("ZENFIX_STORE_PATH");
    const readyPath = requireEnvironment("ZENFIX_READY_PATH");
    const releasePath = requireEnvironment("ZENFIX_RELEASE_PATH");
    const canonicalStorePath = await canonicalizeStorePath(storePath);
    const lease = await acquireWriterLease({
      canonicalStorePath,
      instanceId: `child-${process.pid}`,
    });

    await writeFile(readyPath, "ready", { flag: "wx" });
    await expect.poll(async () => {
      try {
        await access(releasePath);
        return true;
      } catch {
        return false;
      }
    }, { timeout: 8_000 }).toBe(true);
    await lease.release();
  }, 10_000);
});

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
