// The chain port. The orchestrator depends on this interface, not on viem/RPC, so
// it unit-tests with a fake and swaps to a real Base Sepolia adapter (M2b) with no
// change to the policy/orchestration logic — mirroring the storage ports pattern.

export interface PayoutCall {
  readonly vault: string;
  readonly intentId: string;
  readonly recipient: string;
  readonly amountAtomic: string;
}

// A submitted payout either mined (ok, with its tx hash) or the vault rejected it
// (the on-chain teeth: e.g. recipient not allow-listed / over cap / expired).
export type PayoutResult =
  | { readonly ok: true; readonly txHash: string }
  | { readonly ok: false; readonly reason: string };

export interface DisburseChain {
  // The vault's current daily spend, so the off-chain gate can enforce the daily cap.
  getSpentTodayAtomic(vault: string): Promise<string>;
  // Submit vault.payout(intentId, recipient, amount) and resolve once mined/read back.
  payout(call: PayoutCall): Promise<PayoutResult>;
}
