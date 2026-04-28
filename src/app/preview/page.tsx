"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance } from "wagmi";
import { SwapPreviewCard } from "@/components/SwapPreviewCard";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  DAI:  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  ARB:  "0x912CE59144191C1204E64559FE8253a0e49E6548",
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
};

export interface ParsedIntent {
  raw: string;
  fromToken: string;
  toToken: string;
  amount: number | null;
  amountType: "exact" | "percentage" | "max" | null;
  slippagePref: "low" | "normal" | "high";
  summary: string;
  intentType?: "swap" | "conditional";
  condition?: { token: string; operator: "above" | "below"; targetPrice: number };
  parsedBy?: "llm" | "rules";
}

const SLIPPAGE_MAP = { low: 0.5, normal: 1.0, high: 3.0 };

export default function PreviewPage() {
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [slippagePref, setSlippagePref] = useState<"low" | "normal" | "high">("normal");
  const [quote, setQuote] = useState<{ amountOut: string; priceImpact?: string } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const router = useRouter();
  const { address, isConnected } = useAccount();

  // 余额查询
  const isNativeETH = intent?.fromToken === "ETH";
  const tokenAddress = intent ? TOKEN_ADDRESSES[intent.fromToken] : undefined;
  const { data: balance } = useBalance(
    address
      ? { address, ...(isNativeETH ? {} : { token: tokenAddress }) }
      : undefined
  );

  // 计算实际 swap 数量（处理 max/percentage）— 必须在 insufficientBalance 之前
  const resolvedAmount = (() => {
    if (!intent) return null;
    const bal = balance ? Number(balance.formatted) : null;
    if (intent.amountType === "max" && bal !== null) {
      return intent.fromToken === "ETH" ? Math.max(0, bal - 0.005) : bal;
    }
    if (intent.amountType === "percentage" && bal !== null && intent.amount !== null) {
      return (bal * intent.amount) / 100;
    }
    return intent.amount;
  })();

  const insufficientBalance =
    balance && resolvedAmount
      ? Number(balance.formatted) < resolvedAmount
      : false;

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    setIntent(JSON.parse(raw) as ParsedIntent);
    const parsed = JSON.parse(raw) as ParsedIntent;
    setSlippagePref(parsed.slippagePref ?? "normal");
  }, [router]);

  // 单独监听 intent + slippagePref，变化时重新拉报价
  useEffect(() => {
    if (!intent || !resolvedAmount || intent.fromToken === intent.toToken) return;
    setQuoteLoading(true);
    setQuote(null);
    fetch("/api/swap-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromToken: intent.fromToken,
        toToken: intent.toToken,
        amount: resolvedAmount,
        slippagePref,
        walletAddress: "0x0000000000000000000000000000000000000001",
        quoteOnly: true,
      }),
    })
      .then((r) => r.json())
      .then((data) => { if (data.amountOut || data.toAmount) setQuote({ amountOut: data.amountOut ?? data.toAmount }); })
      .catch(() => {})
      .finally(() => setQuoteLoading(false));
  }, [intent, slippagePref, resolvedAmount]);

  if (!intent) return null;

  const isConditional = intent.intentType === "conditional";
  const slippage = SLIPPAGE_MAP[slippagePref];

  const handleSubmitOrder = async () => {
    if (!email || !intent.condition) return;
    setOrderSubmitting(true);
    try {
      await fetch("https://api.o-sheepps.com/swap-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amount: intent.amount,
          condition: intent.condition,
        }),
      });
      setOrderSubmitted(true);
    } catch {
      // ignore
    } finally {
      setOrderSubmitting(false);
    }
  };

  // 条件单 UI
  if (isConditional) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 animate-fade-in">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <p className="text-stone-500 text-xs tracking-widest uppercase">Conditional Order</p>
            <p className="text-stone-400 text-sm italic">"{intent.raw}"</p>
          </div>

          <div className="bg-stone-900/40 border border-stone-800/60 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Token</span>
              <span className="text-stone-200">{intent.condition?.token}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Trigger</span>
              <span className="text-stone-200">
                {intent.condition?.operator === "below" ? "Drops below" : "Rises above"} ${intent.condition?.targetPrice.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Action</span>
              <span className="text-stone-200">{intent.fromToken} → {intent.toToken}{intent.amount ? ` (${intent.amount})` : ""}</span>
            </div>
          </div>

          {orderSubmitted ? (
            <div className="text-center space-y-2">
              <p className="text-gold-400 text-sm">✦ Order set</p>
              <p className="text-stone-500 text-xs">We'll email {email} when the condition is triggered.</p>
              <button onClick={() => router.push("/")} className="text-stone-600 hover:text-stone-400 text-sm mt-4 block mx-auto">
                New swap →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-stone-900/60 border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-stone-500"
              />
              <div className="flex gap-3">
                <button onClick={() => router.push("/")} className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 rounded-xl text-sm transition-colors">
                  ← Revise
                </button>
                <button
                  onClick={handleSubmitOrder}
                  disabled={!email || orderSubmitting}
                  className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
                >
                  {orderSubmitting ? "Setting..." : "Set Alert"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // 把 slippagePref 写回 sessionStorage，execute 页读取
  const handleConfirm = () => {
    // 把解析后的实际数量写入，execute 页直接用
    const updated = { ...intent, slippagePref, amount: resolvedAmount ?? intent.amount };
    sessionStorage.setItem("intent-preview", JSON.stringify(updated));
    router.push("/execute");
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 animate-fade-in">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <p className="text-stone-500 text-xs tracking-widest uppercase">Review your swap</p>
          <p className="text-stone-400 text-sm italic">"{intent.raw}"</p>
        </div>

        <SwapPreviewCard
          intent={intent}
          slippage={slippage}
          address={address}
          quote={quote}
          quoteLoading={quoteLoading}
          balance={balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : undefined}
          resolvedAmount={resolvedAmount}
        />

        {/* 滑点调节 */}
        <div className="flex items-center justify-between px-1">
          <span className="text-stone-600 text-xs">Slippage</span>
          <div className="flex gap-1">
            {(["low", "normal", "high"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSlippagePref(opt)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  slippagePref === opt
                    ? "bg-gold-500/20 text-gold-400 border border-gold-500/40"
                    : "text-stone-600 hover:text-stone-400 border border-transparent"
                }`}
              >
                {opt === "low" ? "0.5%" : opt === "normal" ? "1%" : "3%"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
          >
            ← Revise
          </button>
          {isConnected ? (
            <button
              onClick={handleConfirm}
              disabled={insufficientBalance}
              className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
            >
              {insufficientBalance ? "Insufficient balance" : "Confirm & Swap"}
            </button>
          ) : (
            <div className="flex-1">
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button
                    onClick={openConnectModal}
                    className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors"
                  >
                    Connect wallet to swap
                  </button>
                )}
              </ConnectButton.Custom>
            </div>
          )}
        </div>

        <p className="text-center text-stone-700 text-xs">
          Rates are estimates. Final amount may vary within slippage tolerance.
        </p>
      </div>
    </main>
  );
}
