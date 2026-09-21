import type { DisburseChain } from "./chain";
import {
  evaluateDisburse,
  type DisburseIntent,
  type DisbursePolicy,
  type DisburseReason,
} from "./policy";

// The M2 bridge: ZenFix's off-chain policy gate → the on-chain teeth.
//   1. read the vault's daily spend,
//   2. run the disbursement policy,
//   3. only if it allows, submit vault.payout(),
//   4. surface a mined tx, an off-chain block, OR an on-chain revert (defence-in-depth).
// The point it proves: a payout reaches the chain ONLY after passing policy, and even
// if the gate is wrong, the vault still rejects it — the two layers compose.

export type DisburseOutcome =
  | { readonly status: "disbursed"; readonly txHash: string }
  // ZenFix's off-chain gate stopped it before any gas was spent.
  | { readonly status: "blocked"; readonly reason: DisburseReason }
  // The gate let it through but the vault rejected it — the teeth caught what we missed.
  | { readonly status: "reverted_onchain"; readonly reason: string };

export async function disburse(
  chain: DisburseChain,
  policy: DisbursePolicy,
  intent: DisburseIntent,
  nowSec: number,
): Promise<DisburseOutcome> {
  const spentToday = await chain.getSpentTodayAtomic(policy.vault);
  const decision = evaluateDisburse(policy, intent, spentToday, nowSec);
  if (decision.outcome === "block") {
    return { status: "blocked", reason: decision.reason };
  }

  const result = await chain.payout({
    vault: policy.vault,
    intentId: intent.intentId,
    recipient: intent.recipient,
    amountAtomic: intent.amountAtomic,
  });
  if (!result.ok) {
    return { status: "reverted_onchain", reason: result.reason };
  }
  return { status: "disbursed", txHash: result.txHash };
}
