"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHistory, clearHistory, type SwapRecord } from "@/lib/history";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

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
    <main className="min-h-screen px-4 py-12 max-w-lg mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-stone-200 font-medium">Swap History</h1>
          <p className="text-stone-600 text-xs mt-0.5">{records.length} transaction{records.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-4">
          {records.length > 0 && (
            <button onClick={handleClear} className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
              Clear
            </button>
          )}
          <Link href="/" className="text-stone-600 hover:text-stone-400 text-sm transition-colors">← Back</Link>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="text-stone-800 text-4xl">✦</div>
          <p className="text-stone-600 text-sm">No swaps yet</p>
          <Link href="/" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">Make your first swap →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-stone-300 text-sm font-medium">{r.amount} {r.fromToken}</span>
                  <span className="text-stone-700 text-xs">→</span>
                  <span className="text-stone-400 text-sm">{r.toToken}</span>
                </div>
                <span className="text-stone-700 text-xs">{timeAgo(r.timestamp)}</span>
              </div>

              {r.amountOut && (
                <div className="flex justify-between">
                  <span className="text-stone-600 text-xs">Received</span>
                  <span className="text-stone-400 text-xs">{parseFloat(r.amountOut).toFixed(6)} {r.toToken}</span>
                </div>
              )}

              {r.gasCostUSD && r.gasCostUSD !== "0" && (
                <div className="flex justify-between">
                  <span className="text-stone-600 text-xs">Gas</span>
                  <span className="text-stone-600 text-xs">~${r.gasCostUSD}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-stone-800/40">
                <span className="text-stone-700 text-xs font-mono">{r.txHash.slice(0, 10)}…{r.txHash.slice(-6)}</span>
                <a
                  href={`https://arbiscan.io/tx/${r.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-500/60 hover:text-gold-400 text-xs transition-colors"
                >
                  Arbiscan ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
