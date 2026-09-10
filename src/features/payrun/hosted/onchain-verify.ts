// On-chain verification of an agent's reported execution. ZenFix still never
// moves funds — the agent executes a real USDC transfer (on Base Sepolia OR Base
// mainnet) and reports the tx hash; here we READ the public chain and confirm the
// proof is real: the transaction succeeded, it moved that chain's USDC token, and
// the amount is at least what was authorized (optionally to a claimed recipient).
// Read-only, no keys, best-effort with a short timeout; a failure to verify is
// reported as unverified rather than throwing.

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPC_TIMEOUT_MS = 6000;

// Rails whose reported executions are verified on-chain. Anything else (e.g.
// "base") is recorded as self-reported. Adding a chain is just another entry.
export const VERIFIED_RAILS = ["base-sepolia", "base-mainnet"] as const;
export type VerifiedRail = (typeof VERIFIED_RAILS)[number];
export function isVerifiedRail(rail: string): rail is VerifiedRail {
  return (VERIFIED_RAILS as readonly string[]).includes(rail);
}

interface ChainConfig { readonly rpc: string; readonly usdc: string; readonly label: string }
function chainFor(rail: VerifiedRail): ChainConfig {
  if (rail === "base-mainnet") {
    return {
      rpc: process.env.ZENFIX_BASE_MAINNET_RPC || "https://mainnet.base.org",
      // Circle's native USDC on Base mainnet (overridable).
      usdc: (process.env.ZENFIX_BASE_MAINNET_USDC || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase(),
      label: "Base mainnet",
    };
  }
  return {
    rpc: process.env.ZENFIX_BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    // Circle's test USDC on Base Sepolia (overridable).
    usdc: (process.env.ZENFIX_BASE_SEPOLIA_USDC || "0x036CbD53842c5426634e7929541eC2318f3dCF7e").toLowerCase(),
    label: "Base Sepolia",
  };
}

export function isTxHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export type VerifyResult =
  | { readonly ok: true; readonly amountAtomic: string; readonly recipient: string }
  | { readonly ok: false; readonly reason: string };

interface Log { readonly address: string; readonly topics: string[]; readonly data: string }
interface Receipt { readonly status: string; readonly logs: Log[] }

async function getReceipt(rpc: string, txHash: string): Promise<Receipt | null | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
      signal: controller.signal,
    });
    if (!res.ok) return "error";
    const body = (await res.json()) as { result?: Receipt | null };
    return body.result ?? null;
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

// Verify a USDC transfer of at least minAmountAtomic on the rail's chain. When
// expectedRecipient is given, a qualifying transfer must be TO that address.
export async function verifyUsdcTransfer(
  rail: VerifiedRail,
  txHash: string,
  minAmountAtomic: string,
  expectedRecipient?: string | null,
): Promise<VerifyResult> {
  const chain = chainFor(rail);
  if (!isTxHash(txHash)) return { ok: false, reason: "transactionHash is not a 32-byte hex hash" };
  const receipt = await getReceipt(chain.rpc, txHash);
  if (receipt === "error") return { ok: false, reason: `could not reach the ${chain.label} RPC to verify the transaction` };
  if (receipt === null) return { ok: false, reason: `transaction not found or not yet confirmed on ${chain.label}` };
  if (receipt.status !== "0x1") return { ok: false, reason: "transaction reverted on-chain" };

  const usdc = chain.usdc;
  const want = expectedRecipient ? normalizeAddress(expectedRecipient) : null;
  const min = BigInt(minAmountAtomic);
  for (const log of receipt.logs) {
    if (normalizeAddress(log.address) !== usdc) continue;
    if ((log.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    const to = `0x${(log.topics[2] ?? "").slice(-40)}`.toLowerCase();
    if (want && to !== want) continue;
    let amount: bigint;
    try { amount = BigInt(log.data); } catch { continue; }
    if (amount >= min) return { ok: true, amountAtomic: amount.toString(), recipient: to };
  }
  return {
    ok: false,
    reason: want
      ? "no USDC transfer to the claimed recipient for at least the authorized amount was found"
      : "no USDC transfer of at least the authorized amount was found in the transaction",
  };
}

// Back-compat convenience for the Base Sepolia rail.
export const verifyBaseSepoliaUsdcTransfer = (
  txHash: string, minAmountAtomic: string, expectedRecipient?: string | null,
): Promise<VerifyResult> => verifyUsdcTransfer("base-sepolia", txHash, minAmountAtomic, expectedRecipient);
