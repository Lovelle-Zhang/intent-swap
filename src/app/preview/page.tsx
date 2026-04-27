"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance } from "wagmi";
import { SwapPreviewCard } from "@/components/SwapPreviewCard";

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
}

const SLIPPAGE_MAP = { low: 0.5, normal: 1.0, high: 3.0 };

export default function PreviewPage() {
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [quote, setQuote] = useState<{ amountOut: string; priceImpact?: string } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const router = useRouter();
  const { address } = useAccount();

  // 余额查询
  const isNativeETH = intent?.fromToken === "ETH";
  const tokenAddress = intent ? TOKEN_ADDRESSES[intent.fromToken] : undefined;
  const { data: balance } = useBalance(
    address
      ? { address, ...(isNativeETH ? {} : { token: tokenAddress }) }
      : undefined
  );

  const insufficientBalance =
    balance && intent?.amount
      ? Number(balance.formatted) < intent.amount
      : false;

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    const parsed = JSON.parse(raw) as ParsedIntent;
    setIntent(parsed);

    // 获取真实报价
    if (parsed.amount && parsed.fromToken !== parsed.toToken) {
      setQuoteLoading(true);
      fetch("/api/swap-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: parsed.fromToken,
          toToken: parsed.toToken,
          amount: parsed.amount,
          slippagePref: parsed.slippagePref,
          walletAddress: address ?? "0x0000000000000000000000000000000000000001",
          quoteOnly: true,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.amountOut) setQuote({ amountOut: data.amountOut });
        })
        .catch(() => {})
        .finally(() => setQuoteLoading(false));
    }
  }, [router, address]);

  if (!intent) return null;

  const slippage = SLIPPAGE_MAP[intent.slippagePref];

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
        />

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
          >
            ← Revise
          </button>
          <button
            onClick={() => router.push("/execute")}
            disabled={insufficientBalance}
            className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
          >
            {insufficientBalance ? "Insufficient balance" : "Confirm & Swap"}
          </button>
        </div>

        <p className="text-center text-stone-700 text-xs">
          Rates are estimates. Final amount may vary within slippage tolerance.
        </p>
      </div>
    </main>
  );
}
