// The slice of DisbursementVault the disburser adapter calls: read daily state,
// submit payout, and the custom errors so a revert decodes to a readable reason.
export const DISBURSEMENT_VAULT_ABI = [
  { type: "function", name: "spentToday", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "dayStart", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "payout",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Payout",
    inputs: [
      { name: "intentId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "policyHash", type: "bytes32", indexed: false },
    ],
  },
  { type: "error", name: "NotDisburser", inputs: [] },
  { type: "error", name: "Replay", inputs: [] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "RecipientNotAllowed", inputs: [] },
  { type: "error", name: "OverPerTxCap", inputs: [] },
  { type: "error", name: "OverDailyCap", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const;

const DAY_SECONDS = 86400n;

// The vault resets spentToday on the first payout after a day elapses. The off-chain
// gate must mirror that: if the window has rolled, the effective spend is 0. Pure so
// it unit-tests without a chain.
export function effectiveSpentTodayAtomic(dayStart: bigint, spentToday: bigint, nowSec: bigint): string {
  return nowSec >= dayStart + DAY_SECONDS ? "0" : spentToday.toString();
}
