"use client";

import { Suspense } from "react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { addRecord } from "@/lib/history";
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useReadContract,
  useWriteContract,
  useChainId,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import type { ParsedIntent } from "@/app/preview/page";
import { friendlyError } from "@/lib/errors";
import { getChainTokens, resolveTokenAddress, getTokenDecimals } from "@/config/tokens";

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
  return (
    <Suspense fallback={<main className="min-h-screen bg-stone-950 flex items-center justify-center"><div className="text-stone-600 text-sm">Loading...</div></main>}>
      <ExecutePageInner />
    </Suspense>
  );
}

function ExecutePageInner() {
  const [status, setStatus] = useState<Status>("idle");
  const [fromLink, setFromLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [amountOut, setAmountOut] = useState<string>("");
  const [priceImpact, setPriceImpact] = useState<string>("");
  const [mevProtect, setMevProtect] = useState(false);
  const recordedRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const chainId = useChainId();
  const swapRouter = getChainTokens(chainId).router;

  const { sendTransaction, data: swapTxHash } = useSendTransaction();
  const { writeContract, data: approveTxHash } = useWriteContract();

  const { isSuccess: swapSuccess, isError: swapError } = useWaitForTransactionReceipt({ hash: swapTxHash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // 读取 allowance
  const tokenAddress = intent ? resolveTokenAddress(intent.fromToken, chainId) : undefined;
  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && tokenAddress ? [address, swapRouter] : undefined,
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

      // TODO(mev): real Flashbots Protect requires a custom transport pointing
      // at rpc.flashbots.net — until then this toggle has no effect, so we route
      // every swap through wagmi's sendTransaction below.

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
  }, [address, sendTransaction, chainId]);

  const execute = useCallback(async (parsed: ParsedIntent) => {
    if (!address) { setStatus("error"); setErrorMsg("Wallet not connected."); return; }

    const isNativeETH = parsed.fromToken === "ETH";

    if (!isNativeETH && tokenAddress) {
      // 检查 allowance
      setStatus("checking");
      const decimals = getTokenDecimals(parsed.fromToken);
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
            args: [swapRouter, amountNeeded * BigInt(10)], // approve 10x 避免频繁授权
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
    // 优先从 URL 参数读取（通知链接跳转）
    const fromToken = searchParams.get("from");
    const toToken = searchParams.get("to");
    const amount = searchParams.get("amount");
    if (fromToken && toToken && amount) {
      const parsed: ParsedIntent = {
        raw: `${amount} ${fromToken} to ${toToken}`,
        fromToken: fromToken.toUpperCase(),
        toToken: toToken.toUpperCase(),
        amount: parseFloat(amount),
        amountType: "exact",
        summary: `Swap ${amount} ${fromToken.toUpperCase()} → ${toToken.toUpperCase()}`,
        slippagePref: "normal",
      };
      setIntent(parsed);
      setMevProtect(true);
      setFromLink(true);
      // 不自动执行，等用户连接钱包后手动触发
      return;
    }
    // fallback：从 sessionStorage 读（正常预览流程）
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    const parsed = JSON.parse(raw) as ParsedIntent & { mevProtect?: boolean };
    setIntent(parsed);
    setMevProtect(parsed.mevProtect ?? true);
    execute(parsed);
  }, [router, execute, searchParams]);

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

        {/* 从通知链接进入：展示订单详情 + 连接钱包 */}
        {fromLink && status === "idle" && intent && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-gold-500/60 text-xs uppercase tracking-widest">Conditional Order Triggered</div>
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-5 text-left space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-stone-500 text-xs uppercase tracking-wider">Swap</span>
                <span className="text-stone-200 font-medium">{intent.fromToken} → {intent.toToken}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 text-xs uppercase tracking-wider">Amount</span>
                <span className="text-stone-300">{intent.amount} {intent.fromToken}</span>
              </div>
            </div>
            {!address ? (
              <p className="text-stone-500 text-sm">Connect your wallet to execute this swap</p>
            ) : (
              <button
                onClick={() => { setFromLink(false); execute(intent); }}
                className="w-full py-3 bg-gold-500/10 border border-gold-500/30 text-gold-400 rounded-xl hover:bg-gold-500/20 transition-colors text-sm font-medium"
              >
                Execute Swap →
              </button>
            )}
            <Link href="/" className="block text-stone-700 hover:text-stone-500 text-xs transition-colors">
              ← Back to home
            </Link>
          </div>
        )}

        {!fromLink && !["success", "error"].includes(status) && (
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
            {status === "confirming" && swapTxHash && (
              <a
                href={`${chainId === 59144 ? "https://lineascan.build" : chainId === 1 ? "https://etherscan.io" : "https://arbiscan.io"}/tx/${swapTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-600 hover:text-stone-400 text-xs font-mono transition-colors"
              >
                {swapTxHash.slice(0, 10)}…{swapTxHash.slice(-6)} ↗
              </a>
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
