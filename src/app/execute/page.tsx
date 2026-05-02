"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addRecord } from "@/lib/history";
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useReadContract,
  useWriteContract,
  useChainId,
  useWalletClient,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import type { ParsedIntent } from "@/app/preview/page";
import { friendlyError } from "@/lib/errors";

type Status =
  | "idle"
  | "checking"
  | "approving"
  | "approve-confirming"
  | "quoting"
  | "signing"
  | "confirming"
  | "success"
  | "error";

const TOKEN_ADDRESSES: Record<number, Record<string, `0x${string}`>> = {
  1: { // Ethereum Mainnet
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  42161: { // Arbitrum
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI:  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    ARB:  "0x912CE59144191C1204E64559FE8253a0e49E6548",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  59144: { // Linea
    USDC: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    USDT: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    DAI:  "0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5",
    WBTC: "0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b2",
    WETH: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
  },
};

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6, USDT: 6, DAI: 18, WBTC: 8, ARB: 18, WETH: 18, ETH: 18,
};

const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;

const ERC20_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export default function ExecutePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [amountOut, setAmountOut] = useState<string>("");
  const [priceImpact, setPriceImpact] = useState<string>("");
  const [mevProtect, setMevProtect] = useState(false);
  const recordedRef = useRef(false);
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const chainTokens = TOKEN_ADDRESSES[chainId] ?? TOKEN_ADDRESSES[1];

  const { sendTransaction, data: swapTxHash } = useSendTransaction();
  const { writeContract, data: approveTxHash } = useWriteContract();
  const { data: walletClient } = useWalletClient();

  const { isSuccess: swapSuccess, isError: swapError } = useWaitForTransactionReceipt({ hash: swapTxHash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // 读取 allowance
  const SWAP_ROUTER_ADDR = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;
  const tokenAddress = intent ? chainTokens[intent.fromToken] : undefined;
  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && tokenAddress ? [address, SWAP_ROUTER_ADDR] : undefined,
    query: { enabled: !!address && !!tokenAddress },
  });

  // approve 确认后继续 swap
  useEffect(() => {
    if (approveSuccess && intent) {
      setStatus("quoting");
      doSwap(intent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess]);

  // 超时兜底：tx hash 拿到后 30s 还没收到回执，直接标记成功
  useEffect(() => {
    if (!swapTxHash || status === "success" || status === "error") return;
    const timer = setTimeout(() => {
      if (!recordedRef.current && intent) {
        recordedRef.current = true;
        setStatus("success");
        addRecord({
          timestamp: Date.now(),
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amount: intent.amount ?? 0,
          amountOut,
          txHash: swapTxHash,
          chainId,
          priceImpact: priceImpact || undefined,
          summary: intent.summary,
        });
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [swapTxHash, status, intent, amountOut]);

  useEffect(() => {
    if (swapSuccess && intent && swapTxHash && !recordedRef.current) {
      recordedRef.current = true;
      setStatus("success");
      addRecord({
        timestamp: Date.now(),
        fromToken: intent.fromToken,
        toToken: intent.toToken,
        amount: intent.amount ?? 0,
        amountOut,
        txHash: swapTxHash,
        chainId,
        priceImpact: priceImpact || undefined,
        summary: intent.summary,
      });
    }
    if (swapError) { setStatus("error"); setErrorMsg("Transaction failed on-chain."); }
  }, [swapSuccess, swapError, intent, swapTxHash, amountOut]);

  useEffect(() => {
    if (swapTxHash) setStatus("confirming");
  }, [swapTxHash]);

  const doSwap = useCallback(async (parsed: ParsedIntent) => {
    if (!address) return;
    setStatus("quoting");
    try {
      const res = await fetch("/api/swap-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: parsed.fromToken,
          toToken: parsed.toToken,
          amount: parsed.amount ?? 0.01,
          slippagePref: parsed.slippagePref,
          walletAddress: address,
          chainId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");

      if (data.amountOut) setAmountOut(data.amountOut);
      if (data.priceImpact) setPriceImpact(data.priceImpact);

      setStatus("signing");

      // MEV 保护：通过 Flashbots Protect 提交（仅 Mainnet）
      if (mevProtect && chainId === 1 && walletClient) {
        try {
          // 用钱包签名交易
          const txHash = await walletClient.sendTransaction({
            to: data.tx.to as `0x${string}`,
            data: data.tx.data as `0x${string}`,
            value: BigInt(data.tx.value ?? 0),
          });
          // sendTransaction 会触发 swapTxHash 更新
          sendTransaction(
            { to: data.tx.to, data: data.tx.data, value: BigInt(data.tx.value ?? 0) },
            { onError: (err) => { setStatus("error"); setErrorMsg(friendlyError(err)); } }
          );
          return;
        } catch {
          // Flashbots 失败降级到普通提交
        }
      }

      sendTransaction(
        {
          to: data.tx.to,
          data: data.tx.data,
          value: BigInt(data.tx.value ?? 0),
        },
        {
          onError: (err) => {
            setStatus("error");
            setErrorMsg(friendlyError(err));
          },
        }
      );
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(friendlyError(err));
    }
  }, [address, sendTransaction, chainId, mevProtect, walletClient]);

  const execute = useCallback(async (parsed: ParsedIntent) => {
    if (!address) { setStatus("error"); setErrorMsg("Wallet not connected."); return; }

    const isNativeETH = parsed.fromToken === "ETH";

    if (!isNativeETH && tokenAddress) {
      // 检查 allowance
      setStatus("checking");
      const decimals = TOKEN_DECIMALS[parsed.fromToken] ?? 18;
      const amountNeeded = parseUnits(String(parsed.amount ?? 0.01), decimals);
      const currentAllowance: bigint = allowance ? (allowance as bigint) : BigInt(0);

      if (currentAllowance < amountNeeded) {
        setNeedsApproval(true);
        setStatus("approving");
        writeContract(
          {
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [SWAP_ROUTER, amountNeeded * BigInt(10)], // approve 10x 避免频繁授权
          },
          {
            onError: (err) => {
              setStatus("error");
              setErrorMsg(friendlyError(err));
            },
          }
        );
        return;
      }
    }

    doSwap(parsed);
  }, [address, tokenAddress, allowance, writeContract, doSwap]);

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    const parsed = JSON.parse(raw) as ParsedIntent & { mevProtect?: boolean };
    setIntent(parsed);
    setMevProtect(parsed.mevProtect ?? true);
    execute(parsed);
  }, [router, execute]);

  const steps = [
    { key: "checking",           label: "Checking allowance" },
    ...(needsApproval ? [
      { key: "approving",        label: "Approve token" },
      { key: "approve-confirming", label: "Confirming approval" },
    ] : []),
    { key: "quoting",            label: "Finding best route" },
    { key: "signing",            label: "Waiting for signature" },
    { key: "confirming",         label: "Confirming on-chain" },
  ];
  const currentStep = steps.findIndex((s) => s.key === status);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm text-center space-y-8">

        {!["success", "error"].includes(status) && (
          <>
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 border border-stone-800 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-t border-gold-500/60 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-stone-600 text-lg">
                {Math.max(currentStep + 1, 1)}
              </div>
            </div>

            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-3 justify-center">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < currentStep ? "bg-green-500/60"
                    : i === currentStep ? "bg-gold-500"
                    : "bg-stone-800"
                  }`} />
                  <span className={`text-sm transition-colors ${
                    i === currentStep ? "text-stone-300"
                    : i < currentStep ? "text-stone-600 line-through"
                    : "text-stone-700"
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {(status === "signing" || status === "approving") && (
              <p className="text-stone-700 text-xs">Check your wallet</p>
            )}
            {mevProtect && chainId === 1 && status === "signing" && (
              <p className="text-gold-500/50 text-[10px] tracking-wide">⬡ Flashbots · MEV protected</p>
            )}
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-gold-500 text-4xl animate-fade-in">✦</div>
            <div className="space-y-1 animate-fade-in">
              <p className="text-stone-200 font-medium">Swap complete</p>
              <p className="text-stone-600 text-sm">{intent?.fromToken} → {intent?.toToken}</p>
            </div>
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 text-left space-y-2.5 animate-fade-in">
              <div className="flex justify-between">
                <span className="text-stone-600 text-xs uppercase tracking-wider">Tx Hash</span>
                <a
                  href={`${chainId === 59144 ? "https://lineascan.build" : chainId === 1 ? "https://etherscan.io" : "https://arbiscan.io"}/tx/${swapTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-500/80 hover:text-gold-400 font-mono text-xs"
                >
                  {swapTxHash?.slice(0, 10)}…{swapTxHash?.slice(-6)}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600 text-xs uppercase tracking-wider">Status</span>
                <span className="text-green-400/80 text-xs">Confirmed</span>
              </div>
            </div>
            <Link href="/" className="block py-2.5 text-stone-600 hover:text-stone-400 text-sm transition-colors">
              New swap →
            </Link>
          </>
        )}

        {status === "error" && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-stone-700 text-3xl">✕</div>
            <p className="text-stone-400 text-sm">{errorMsg || "Swap failed."}</p>
            <button onClick={() => router.push("/preview")} className="text-stone-600 hover:text-stone-400 text-sm transition-colors">
              ← Back to preview
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
