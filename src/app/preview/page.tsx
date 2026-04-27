"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { SwapPreviewCard } from "@/components/SwapPreviewCard";

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
  const router = useRouter();
  const { address } = useAccount();

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    setIntent(JSON.parse(raw));
  }, [router]);

  if (!intent) return null;

  const slippage = SLIPPAGE_MAP[intent.slippagePref];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 animate-fade-in">
      <div className="w-full max-w-md space-y-6">
        {/* 标题 */}
        <div className="text-center space-y-1">
          <p className="text-stone-500 text-xs tracking-widest uppercase">Review your swap</p>
          <p className="text-stone-400 text-sm italic">"{intent.raw}"</p>
        </div>

        <SwapPreviewCard intent={intent} slippage={slippage} address={address} />

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
          >
            ← Revise
          </button>
          <button
            onClick={() => router.push("/execute")}
            className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors"
          >
            Confirm & Swap
          </button>
        </div>

        {/* 免责 */}
        <p className="text-center text-stone-700 text-xs">
          Rates are estimates. Final amount may vary within slippage tolerance.
        </p>
      </div>
    </main>
  );
}
