import { describe, expect, test } from "vitest";

import { disburse } from "@/features/disburse/disburse";
import type { DisburseChain, PayoutCall, PayoutResult } from "@/features/disburse/chain";
import type { DisburseIntent, DisbursePolicy } from "@/features/disburse/policy";

const POLICY: DisbursePolicy = {
  vault: "0xVault",
  allowlist: ["0xAlice", "0xBob"],
  perTxAtomic: "100000000", // 100 USDC
  dailyCapAtomic: "150000000", // 150 USDC/day
  expiry: 2_000_000_000, // far future
};
const NOW = 1_700_000_000;

function fakeChain(opts?: { spentToday?: string; payout?: PayoutResult }) {
  const calls: PayoutCall[] = [];
  const chain: DisburseChain = {
    getSpentTodayAtomic: async () => opts?.spentToday ?? "0",
    payout: async (c) => {
      calls.push(c);
      return opts?.payout ?? { ok: true, txHash: "0xabc" };
    },
  };
  return { chain, calls };
}

function intent(over: Partial<DisburseIntent> = {}): DisburseIntent {
  return { intentId: "i1", recipient: "0xAlice", amountAtomic: "100000000", ...over };
}

describe("disburse — off-chain gate composed with the on-chain teeth", () => {
  test("allowed: policy passes → payout is submitted → disbursed with the tx hash", async () => {
    const { chain, calls } = fakeChain();
    const out = await disburse(chain, POLICY, intent(), NOW);
    expect(out).toEqual({ status: "disbursed", txHash: "0xabc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ vault: "0xVault", recipient: "0xAlice", amountAtomic: "100000000" });
  });

  test("blocked recipient: never reaches the chain (gate saves gas)", async () => {
    const { chain, calls } = fakeChain();
    const out = await disburse(chain, POLICY, intent({ recipient: "0xCarol" }), NOW);
    expect(out).toEqual({ status: "blocked", reason: "recipient_not_allowlisted" });
    expect(calls).toHaveLength(0);
  });

  test("blocked over per-tx cap: never reaches the chain", async () => {
    const { chain, calls } = fakeChain();
    const out = await disburse(chain, POLICY, intent({ amountAtomic: "100000001" }), NOW);
    expect(out).toEqual({ status: "blocked", reason: "over_per_tx_cap" });
    expect(calls).toHaveLength(0);
  });

  test("blocked over daily cap: uses the vault's spent-today", async () => {
    const { chain, calls } = fakeChain({ spentToday: "100000000" }); // 100 already spent
    const out = await disburse(chain, POLICY, intent(), NOW); // +100 → 200 > 150
    expect(out).toEqual({ status: "blocked", reason: "over_daily_cap" });
    expect(calls).toHaveLength(0);
  });

  test("blocked after expiry", async () => {
    const { chain, calls } = fakeChain();
    const out = await disburse(chain, POLICY, intent(), POLICY.expiry); // now == expiry
    expect(out).toEqual({ status: "blocked", reason: "expired" });
    expect(calls).toHaveLength(0);
  });

  test("defence-in-depth: gate allows but the vault reverts → surfaced, not a false success", async () => {
    const { chain, calls } = fakeChain({ payout: { ok: false, reason: "recipient not allow-listed" } });
    const out = await disburse(chain, POLICY, intent(), NOW);
    expect(out).toEqual({ status: "reverted_onchain", reason: "recipient not allow-listed" });
    expect(calls).toHaveLength(1); // it WAS submitted; the teeth caught it
  });
});
