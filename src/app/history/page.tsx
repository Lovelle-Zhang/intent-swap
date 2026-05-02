"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHistory, clearHistory, getExplorerUrl, getExplorerName, type SwapRecord } from "@/lib/history";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  59144: "Linea",
};

const TOKEN_ICONS: Record<string, string> = {
  ETH: "Ξ", USDC: "$", DAI: "◈", WBTC: "₿", USDT: "₮", ARB: "⬡", WETH: "Ξ",
};

export default function HistoryPage() {
  const [records, setRecords] = useState<SwapRecord[]>([]);

  useEffect(() => {
    setRecords(getHistory());
  }, []);

  const handleClear = () => {
    clearHistory();
    setRecords([]);
  };

  return (
    <main className="min-h-screen px-5 py-8 md:py-12">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">History</span>
            </div>
            <p className="text-stone-500 text-xs">
              {records.length} transaction{records.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {records.length > 0 && (
              <button
                onClick={handleClear}
                className="text-stone-700 hover:text-stone-500 text-xs transition-colors"
              >
                Clear all
              </button>
            )}
            <Link href="/" className="text-stone-600 hover:text-stone-400 text-xs tracking-wide transition-colors">
              ← Back
            </Link>
          </div>
        </div>

        {/* Empty state */}
        {records.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
              <span className="text-stone-700 text-lg">✦</span>
            </div>
            <p className="text-stone-600 text-sm">No swaps yet</p>
            <Link
              href="/"
              className="inline-block text-stone-700 hover:text-stone-500 text-xs transition-colors"
            >
              Make your first swap →
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {records.map((r) => {
              const fromIcon = TOKEN_ICONS[r.fromToken] ?? "?";
              const toIcon = TOKEN_ICONS[r.toToken] ?? "?";
              const explorerUrl = getExplorerUrl(r.txHash, r.chainId);
              const explorerName = getExplorerName(r.chainId);
              const chainName = r.chainId ? CHAIN_NAMES[r.chainId] : "Ethereum";
              const priceImpact = r.priceImpact ? parseFloat(r.priceImpact) : null;
              const highImpact = priceImpact !== null && priceImpact > 3;

              return (
                <div
                  key={r.id}
                  className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-3"
                >
                  {/* Top row: tokens + time */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-500 text-sm">{fromIcon}</span>
                      <span className="text-stone-300 text-sm font-medium">{r.amount} {r.fromToken}</span>
                      <span className="text-stone-700 text-xs">→</span>
                      <span className="text-stone-500 text-sm">{toIcon}</span>
                      <span className="text-stone-400 text-sm">{r.toToken}</span>
                    </div>
                    <span className="text-stone-700 text-xs">{timeAgo(r.timestamp)}</span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5">
                    {r.amountOut && (
                      <div className="flex justify-between">
                        <span className="text-stone-600 text-xs">Received</span>
                        <span className="text-gold-400/70 text-xs font-mono">
                          {parseFloat(r.amountOut).toFixed(6)} {r.toToken}
                        </span>
                      </div>
                    )}
                    {priceImpact !== null && (
                      <div className="flex justify-between">
                        <span className="text-stone-600 text-xs">Price impact</span>
                        <span className={`text-xs ${highImpact ? "text-red-400/80" : "text-stone-500"}`}>
                          {priceImpact.toFixed(2)}%{highImpact ? " ⚠" : ""}
                        </span>
                      </div>
                    )}
                    {r.gasCostUSD && r.gasCostUSD !== "0" && (
                      <div className="flex justify-between">
                        <span className="text-stone-600 text-xs">Gas</span>
                        <span className="text-stone-600 text-xs">~${r.gasCostUSD}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-stone-600 text-xs">Network</span>
                      <span className="text-stone-500 text-xs">{chainName}</span>
                    </div>
                  </div>

                  {/* Footer: tx hash + explorer link */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-800/40">
                    <span className="text-stone-700 text-xs font-mono">
                      {r.txHash.slice(0, 10)}…{r.txHash.slice(-6)}
                    </span>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-500/50 hover:text-gold-400/80 text-xs transition-colors"
                    >
                      {explorerName} ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
