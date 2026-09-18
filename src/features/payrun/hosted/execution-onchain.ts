import type { SqlPool } from "../adapters/storage/postgres/sql";
import type { PayRun } from "../domain/types";
import type { ReportInput } from "./execution-report";
import { lookupMerchantAddress } from "./merchant-registry";
import { isVerifiedRail, verifyUsdcTransfer } from "./onchain-verify";
import type { VerifiedAuthIdentity } from "./workspace";
import { getWorkspacePolicy } from "./workspace-policy";

// On-chain proof resolution for an execution report, kept apart from the HTTP
// handler so the handler stays pure orchestration. ZenFix never moves funds: a
// verified-rail (base-sepolia / base-mainnet) "executed" claim must carry a real
// USDC transfer we can READ from the chain (success, right token, amount >=
// authorized, to the expected recipient, optionally from the claimed payer).

// What we proved on-chain, persisted on the report so the receipt can show it.
export interface VerifiedProof {
  readonly chain: string;
  readonly amountAtomic: string;
  readonly recipient: string;
  readonly pinnedMerchant: boolean;
}

// `verified` is null when the rail isn't verified or the outcome isn't executed
// (a legitimately self-reported outcome); `reason` carries the rejection copy for
// an unverifiable claim (surfaced by the handler as 422 — never recorded).
export type OnchainProofResult =
  | { readonly ok: true; readonly verified: VerifiedProof | null }
  | { readonly ok: false; readonly reason: string };

export async function resolveOnchainProof(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  current: PayRun,
  input: ReportInput,
): Promise<OnchainProofResult> {
  if (input.outcome !== "executed" || !isVerifiedRail(input.rail)) {
    return { ok: true, verified: null };
  }
  // The "Verified on-chain" badge requires an OWNER-PINNED payout address as its
  // trust anchor. Only a pinned address is something the agent can't choose: it
  // lets us prove the money reached the destination the OWNER approved. A recipient
  // or sender the agent *declares* per-request can be set to match any public USDC
  // transfer, so without a pin a "verified" badge would be forgeable (any large
  // transfer would pass). So: no pinned address → we don't verify, and the outcome
  // is recorded as self-reported (the agent's claim), never as proof-backed.
  const policy = await getWorkspacePolicy(pool, identity);
  const pinned = lookupMerchantAddress(policy.merchantAddresses, current.intent.merchant.merchantId);
  if (!pinned) {
    return { ok: true, verified: null };
  }
  // The transfer must have gone to the pinned address. If the agent also names the
  // paying wallet, bind the proof to it too: the on-chain transfer must be FROM that
  // wallet (x402/EIP-3009 exposes the authorizing wallet as `from` even when a
  // facilitator submits the tx) — extra assurance on top of the pinned anchor.
  const result = await verifyUsdcTransfer(
    input.rail, input.transactionHash ?? "", current.intent.quotedAmount.amountAtomic, pinned, input.sender,
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    verified: {
      chain: input.rail, amountAtomic: result.amountAtomic,
      recipient: result.recipient, pinnedMerchant: true,
    },
  };
}
