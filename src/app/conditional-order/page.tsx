"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, usePublicClient, useWalletClient, useWriteContract, useReadContract } from "wagmi";
import { parseUnits, encodeFunctionData, type Hex } from "viem";
import Link from "next/link";
import type { ParsedIntent } from "@/app/preview/page";

// Uniswap V3 SwapRouter
const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;

const TOKEN_ADDRESSES: Record<string, { address: Hex; decimals: number }> = {
  ETH:  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
};

const ERC20_ABI = [
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;

type Step = "form" | "approve" | "sign" | "submitting" | "done" | "error";

export default function ConditionalOrderPage() {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");

  // Condition fields (pre-filled from intent)
  const [condToken, setCondToken] = useState("ETH");
  const [condOp, setCondOp] = useState<"above" | "below">("below");
  const [condPrice, setCondPrice] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("conditional-order");
    if (!raw) { router.push("/"); return; }
    const data = JSON.parse(raw);
    setIntent(data.intent);
    // 尝试从意图中预填条件
    if (data.intent?.condition) {
      const c = data.intent.condition;
      if (c.token) setCondToken(c.token);
      if (c.operator) setCondOp(c.operator);
      if (c.targetPrice) setCondPrice(String(c.targetPrice));
    }
    const savedEmail = localStorage.getItem("user-email") ?? "";
    setEmail(savedEmail);
  }, [router]);

  // 检查 allowance（ERC20 → swap 时需要）
  const fromToken = intent?.fromToken ?? "ETH";
  const fromInfo = TOKEN_ADDRESSES[fromToken];
  const isNative = fromToken === "ETH";
  const amount = intent?.amount ?? 0.01;

  const { data: allowance } = useReadContract({
    address: fromInfo?.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SWAP_ROUTER] : undefined,
    query: { enabled: !isNative && !!address && !!fromInfo },
  });

  const needsApproval = !isNative && fromInfo && allowance !== undefined
    ? allowance < parseUnits(String(amount), fromInfo.decimals)
    : false;

  const handleApprove = async () => {
    if (!fromInfo || !address) return;
    setStep("approve");
    try {
      await writeContractAsync({
        address: fromInfo.address,
        abi: [{
          name: "approve", type: "function", stateMutability: "nonpayable",
          inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
          outputs: [{ type: "bool" }],
        }] as const,
        functionName: "approve",
        args: [SWAP_ROUTER, parseUnits(String(amount * 10), fromInfo.decimals)], // 10x buffer
      });
      await handleSignAndSubmit();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setStep("error");
    }
  };

  const handleSignAndSubmit = useCallback(async () => {
    if (!walletClient || !address || !publicClient || !intent) return;
    setStep("sign");
    setError("");

    try {
      // 获取 swap quote + calldata
      const res = await fetch("/api/swap-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amount: intent.amount ?? 0.01,
          slippagePref: intent.slippagePref ?? "normal",
          walletAddress: address,
          chainId,
          quoteOnly: false,
        }),
      });
      const quoteData = await res.json();
      if (!res.ok) throw new Error(quoteData.error ?? "Quote failed");

      // 预签名 swap 交易（不广播）
      const nonce = await publicClient.getTransactionCount({ address });
      const gasPrice = await publicClient.getGasPrice();

      const signedTx = await walletClient.signTransaction({
        to: quoteData.tx.to as Hex,
        data: quoteData.tx.data as Hex,
        value: BigInt(quoteData.tx.value ?? 0),
        nonce,
        gas: BigInt(350000),
        gasPrice: gasPrice * BigInt(12) / BigInt(10), // +20% gas price buffer
        chainId,
      });

      setStep("submitting");

      // 提交订单到服务器（含预签名 tx）
      if (!condPrice || isNaN(Number(condPrice))) throw new Error("Invalid target price");
      localStorage.setItem("user-email", email);

      const submitRes = await fetch("https://api.o-sheepps.com/swap-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amount: intent.amount ?? 0.01,
          condition: {
            token: condToken,
            operator: condOp,
            targetPrice: Number(condPrice),
          },
          signedTx, // 🔑 预签名 tx
          nonce,
          chainId,
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error ?? "Submit failed");

      setOrderId(submitData.id);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setStep("error");
    }
  }, [walletClient, address, publicClient, intent, email, condToken, condOp, condPrice, chainId]);

  const handleConfirm = async () => {
    if (needsApproval) {
      await handleApprove();
    } else {
      await handleSignAndSubmit();
    }
  };

  if (!intent) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
      </main>
    );
  }

  const STEPS: Record<Step, string> = {
    form: "",
    approve: "Approving token...",
    sign: "Sign in wallet...",
    submitting: "Submitting order...",
    done: "",
    error: "",
  };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 animate-fade-in">
      <div className="w-full max-w-sm space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/preview" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">←</Link>
            <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Conditional Order</span>
          </div>
          <h1 className="text-stone-200 text-lg font-light">Set trigger & auto-execute</h1>
          <p className="text-stone-600 text-xs mt-1">
            When the condition is met, your swap executes automatically on-chain.
          </p>
        </div>

        {step === "done" ? (
          // 成功态
          <div className="space-y-6">
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-full border border-stone-700 flex items-center justify-center mx-auto">
                <span className="text-gold-400 text-lg">✓</span>
              </div>
              <p className="text-stone-200 text-sm">Order created</p>
              <p className="text-stone-600 text-xs">
                Swap will execute automatically when {condToken}{" "}
                {condOp === "below" ? "drops below" : "rises above"}{" "}
                <span className="text-gold-400/70">${Number(condPrice).toLocaleString()}</span>
              </p>
              {orderId && (
                <p className="text-stone-700 text-[10px] font-mono">ID: {orderId}</p>
              )}
            </div>
            <div className="flex gap-3">
              <Link href="/orders" className="flex-1 py-2.5 text-center text-stone-400 hover:text-stone-200 border border-stone-800 hover:border-stone-700 rounded-xl text-xs transition-colors">
                View orders
              </Link>
              <Link href="/" className="flex-1 py-2.5 text-center bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-xs transition-colors">
                New swap
              </Link>
            </div>
          </div>
        ) : step === "error" ? (
          <div className="space-y-4">
            <div className="bg-red-900/10 border border-red-800/30 rounded-xl px-5 py-4">
              <p className="text-red-400/80 text-sm">Something went wrong</p>
              <p className="text-red-400/50 text-xs mt-1 break-words">{error}</p>
            </div>
            <button onClick={() => setStep("form")} className="w-full py-2.5 text-stone-400 hover:text-stone-200 border border-stone-800 hover:border-stone-700 rounded-xl text-xs transition-colors">
              Try again
            </button>
          </div>
        ) : (
          // 表单态
          <div className="space-y-4">
            {/* 交易摘要 */}
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-2">
              <p className="text-stone-600 text-[10px] tracking-widest uppercase mb-3">Swap</p>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs">From</span>
                <span className="text-stone-300 text-sm">{intent.amount ?? "—"} {intent.fromToken}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs">To</span>
                <span className="text-stone-400 text-sm">{intent.toToken}</span>
              </div>
            </div>

            {/* 触发条件 */}
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-3">
              <p className="text-stone-600 text-[10px] tracking-widest uppercase">Trigger condition</p>
              <div className="flex gap-2">
                <select
                  value={condToken}
                  onChange={(e) => setCondToken(e.target.value)}
                  className="flex-1 bg-stone-900/60 border border-stone-700/50 rounded-lg px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-stone-600"
                >
                  {Object.keys(TOKEN_ADDRESSES).filter(t => t !== "WETH").map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={condOp}
                  onChange={(e) => setCondOp(e.target.value as "above" | "below")}
                  className="flex-1 bg-stone-900/60 border border-stone-700/50 rounded-lg px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-stone-600"
                >
                  <option value="below">drops below</option>
                  <option value="above">rises above</option>
                </select>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 text-xs">$</span>
                <input
                  type="number"
                  value={condPrice}
                  onChange={(e) => setCondPrice(e.target.value)}
                  placeholder="Target price"
                  className="w-full bg-stone-900/60 border border-stone-700/50 rounded-lg pl-7 pr-4 py-2 text-stone-300 text-xs focus:outline-none focus:border-stone-600"
                />
              </div>
            </div>

            {/* 邮件 */}
            <div className="space-y-1.5">
              <label className="text-stone-600 text-[10px] tracking-widest uppercase">Notification email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-stone-900/40 border border-stone-800/60 rounded-xl px-4 py-2.5 text-stone-300 placeholder-stone-700 text-xs focus:outline-none focus:border-stone-600 transition-colors"
              />
            </div>

            {/* 提示 */}
            <div className="flex items-start gap-2 px-1">
              <span className="text-gold-400/40 text-xs mt-0.5">⬡</span>
              <p className="text-stone-700 text-[11px] leading-relaxed">
                You&apos;ll sign a pre-authorized swap transaction. It stays private until the condition is met — then executes automatically.
                {needsApproval && <span className="text-amber-400/60"> Token approval required first.</span>}
              </p>
            </div>

            {/* 按钮 */}
            {["approve", "sign", "submitting"].includes(step) ? (
              <div className="flex items-center justify-center gap-3 py-3">
                <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
                <p className="text-stone-500 text-sm">{STEPS[step as Step]}</p>
              </div>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={!address || !condPrice || !email}
                className="w-full py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-30 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
              >
                {needsApproval ? "Approve & Pre-sign" : "Pre-sign & Create Order"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
