import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  stringToBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import type { DisburseChain, PayoutCall, PayoutResult } from "./chain";
import { DISBURSEMENT_VAULT_ABI, effectiveSpentTodayAtomic } from "./vault-abi";

// Real Base Sepolia adapter for the disburse orchestrator (M2b). The disburser key
// is read from ZENFIX_DISBURSER_PRIVATE_KEY — supplied by the deploy environment,
// never in code. Use a dedicated testnet-only key. Reads are keyless.

export interface ViemChainConfig {
  readonly rpcUrl?: string;
  readonly privateKey?: Hex;
}

// Any intent-id string → a deterministic bytes32 the vault keys its replay guard on.
function intentIdToBytes32(intentId: string): Hex {
  return keccak256(stringToBytes(intentId));
}

function revertReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.shortMessage; // e.g. "RecipientNotAllowed"
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "unknown error";
}

export function createViemDisburseChain(config: ViemChainConfig = {}): DisburseChain {
  const rpcUrl = config.rpcUrl ?? process.env.ZENFIX_BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
  const key = config.privateKey ?? (process.env.ZENFIX_DISBURSER_PRIVATE_KEY as Hex | undefined);
  if (!key) {
    throw new Error("ZENFIX_DISBURSER_PRIVATE_KEY is not set — the disburser needs a signing key");
  }
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });

  return {
    async getSpentTodayAtomic(vault: string): Promise<string> {
      const address = getAddress(vault);
      const [spent, dayStart] = await Promise.all([
        publicClient.readContract({ address, abi: DISBURSEMENT_VAULT_ABI, functionName: "spentToday" }),
        publicClient.readContract({ address, abi: DISBURSEMENT_VAULT_ABI, functionName: "dayStart" }),
      ]);
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      return effectiveSpentTodayAtomic(dayStart, spent, nowSec);
    },

    async payout(call: PayoutCall): Promise<PayoutResult> {
      const address = getAddress(call.vault);
      const args = [
        intentIdToBytes32(call.intentId),
        getAddress(call.recipient),
        BigInt(call.amountAtomic),
      ] as const;
      try {
        // Simulate first: if the vault would reject (teeth), this reverts with the
        // decoded custom error — so we never send a doomed tx and we get the reason.
        const { request } = await publicClient.simulateContract({
          account,
          address,
          abi: DISBURSEMENT_VAULT_ABI,
          functionName: "payout",
          args,
        });
        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") return { ok: false, reason: "transaction reverted" };
        return { ok: true, txHash: hash };
      } catch (err) {
        return { ok: false, reason: revertReason(err) };
      }
    },
  };
}
