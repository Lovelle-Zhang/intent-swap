import { describe, expect, test } from "vitest";

import { effectiveSpentTodayAtomic } from "@/features/disburse/vault-abi";

// The one part of the viem adapter that's pure and testable without a chain: it must
// mirror the vault's daily-window rollover so the off-chain gate and the on-chain
// teeth agree on "spent today".
describe("effectiveSpentTodayAtomic", () => {
  test("within the window → the vault's spentToday", () => {
    expect(effectiveSpentTodayAtomic(1000n, 500000n, 1000n + 3600n)).toBe("500000");
  });

  test("after a day elapsed → 0 (the vault resets on the next payout)", () => {
    expect(effectiveSpentTodayAtomic(1000n, 500000n, 1000n + 86400n)).toBe("0");
    expect(effectiveSpentTodayAtomic(1000n, 500000n, 1000n + 90000n)).toBe("0");
  });

  test("boundary: exactly dayStart + 1 day rolls over", () => {
    expect(effectiveSpentTodayAtomic(0n, 999n, 86399n)).toBe("999");
    expect(effectiveSpentTodayAtomic(0n, 999n, 86400n)).toBe("0");
  });
});
