// The off-chain disbursement gate. It mirrors DisbursementVault's on-chain rules
// (recipient allow-list, per-tx cap, daily cap, expiry) so ZenFix rejects a bad
// payout BEFORE spending gas — while the vault still enforces the same rules as
// defence-in-depth. Kept small and pure so it unit-tests without a chain.
//
// This is where ZenFix's value can eventually exceed the on-chain module: richer,
// off-chain-only checks (is this invoice real? velocity/fraud signals) slot in as
// extra reason codes. For the PoC it mirrors the module 1:1 plus a hook for those.

export interface DisbursePolicy {
  readonly vault: string; // the DisbursementVault address these rules were granted on
  readonly allowlist: readonly string[]; // recipient addresses (compared case-insensitively)
  readonly perTxAtomic: string; // USDC atomic (6dp)
  readonly dailyCapAtomic: string;
  readonly expiry: number; // unix seconds; payouts blocked at/after this
}

export interface DisburseIntent {
  readonly intentId: string;
  readonly recipient: string;
  readonly amountAtomic: string;
}

export type DisburseReason =
  | "recipient_not_allowlisted"
  | "over_per_tx_cap"
  | "over_daily_cap"
  | "expired";

export type PolicyDecision =
  | { readonly outcome: "allow" }
  | { readonly outcome: "block"; readonly reason: DisburseReason };

function norm(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Evaluate one payout against the granted envelope. `spentTodayAtomic` is the
 * vault's current daily spend (read from chain) and `nowSec` the current time —
 * both injected so this stays pure and testable.
 */
export function evaluateDisburse(
  policy: DisbursePolicy,
  intent: DisburseIntent,
  spentTodayAtomic: string,
  nowSec: number,
): PolicyDecision {
  if (nowSec >= policy.expiry) return { outcome: "block", reason: "expired" };

  const allow = new Set(policy.allowlist.map(norm));
  if (!allow.has(norm(intent.recipient))) {
    return { outcome: "block", reason: "recipient_not_allowlisted" };
  }

  const amount = BigInt(intent.amountAtomic);
  if (amount > BigInt(policy.perTxAtomic)) {
    return { outcome: "block", reason: "over_per_tx_cap" };
  }
  if (BigInt(spentTodayAtomic) + amount > BigInt(policy.dailyCapAtomic)) {
    return { outcome: "block", reason: "over_daily_cap" };
  }
  return { outcome: "allow" };
}
