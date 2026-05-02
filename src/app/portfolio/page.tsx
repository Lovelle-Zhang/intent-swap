"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import type { Hex } from "viem";
import { getHistory, type SwapRecord } from "@/lib/history";

// Token config
interface TokenConfig {
  symbol: string;
  address: Hex | null; // null = native ETH
  decimals: number;
  icon: string;
  coingeckoId: string;
}

const TOKENS: TokenConfig[] = [
  { symbol: "ETH",  address: null, decimals: 18, icon: "Ξ", coingeckoId: "ethereum" },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, icon: "$", coingeckoId: "usd-coin" },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, icon: "₮", coingeckoId: "tether" },
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, icon: "₿", coingeckoId: "wrapped-bitcoin" },
  { symbol: "DAI",  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, icon: "◈", coingeckoId: "dai" },
];

const ERC20_BALANCE_ABI = [{
  name: "balanceOf",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ type: "uint256" }],
}] as const;

interface TokenBalance {
  symbol: string;
  icon: string;
  balance: number;
  price: number;
  value: number;
  change24h?: number;
}

function fmt(n: number, decimals = 4): string {
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtUSD(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

const TOKEN_ICONS: Record<string, string> = {
  ETH: "Ξ", USDC: "$", DAI: "◈", WBTC: "₿", USDT: "₮", ARB: "⬡", WETH: "Ξ",
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<SwapRecord[]>([]);
  const [totalUSD, setTotalUSD] = useState(0);

  useEffect(() => {
    setHistory(getHistory().slice(0, 5));
  }, []);

  useEffect(() => {
    if (!address || !publicClient || !isConnected) return;
    fetchPortfolio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, publicClient]);

  const fetchPortfolio = async () => {
    if (!address || !publicClient) return;
    setLoading(true);

    try {
      // 1. 获取价格（DeFiLlama）
      const ids = TOKENS.map((t) => t.coingeckoId).join(",");
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      const priceData = priceRes.ok ? await priceRes.json() : {};

      // 2. 并行拉余额
      const results: TokenBalance[] = [];

      await Promise.all(
        TOKENS.map(async (token) => {
          try {
            let rawBalance: bigint;
            if (token.address === null) {
              // Native ETH
              rawBalance = await publicClient.getBalance({ address });
            } else {
              rawBalance = await publicClient.readContract({
                address: token.address,
                abi: ERC20_BALANCE_ABI,
                functionName: "balanceOf",
                args: [address],
              }) as bigint;
            }

            const balance = parseFloat(formatUnits(rawBalance, token.decimals));
            const priceInfo = priceData[token.coingeckoId] ?? {};
            const price = priceInfo.usd ?? 0;
            const change24h = priceInfo.usd_24h_change ?? undefined;
            const value = balance * price;

            if (balance > 0.000001 || token.symbol === "ETH") {
              results.push({ symbol: token.symbol, icon: token.icon, balance, price, value, change24h });
            }
          } catch { /* skip failed tokens */ }
        })
      );

      // 按价值排序
      results.sort((a, b) => b.value - a.value);
      setBalances(results);
      setTotalUSD(results.reduce((s, t) => s + t.value, 0));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  if (!isConnected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
            <span className="text-stone-700 text-xl">◎</span>
          </div>
          <p className="text-stone-500 text-sm">Connect wallet to view portfolio</p>
          <Link href="/" className="inline-block text-stone-700 hover:text-stone-500 text-xs transition-colors">
            ← Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 md:py-12 animate-fade-in">
      <div className="max-w-xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Portfolio</span>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-stone-200 text-3xl font-light">
                {loading ? "—" : fmtUSD(totalUSD)}
              </span>
              {!loading && totalUSD > 0 && (
                <span className="text-stone-600 text-xs">total value</span>
              )}
            </div>
            <p className="text-stone-700 text-xs mt-1 font-mono">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="text-stone-700 hover:text-stone-500 disabled:text-stone-800 text-xs transition-colors"
            >
              {loading ? "…" : "↻ refresh"}
            </button>
            <Link href="/" className="text-stone-600 hover:text-stone-400 text-xs transition-colors">
              ← Back
            </Link>
          </div>
        </div>

        {/* Token balances */}
        <div className="space-y-2">
          <p className="text-stone-600 text-[10px] tracking-widest uppercase px-1">Holdings</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 animate-pulse">
                  <div className="flex justify-between">
                    <div className="h-4 w-16 bg-stone-800 rounded" />
                    <div className="h-4 w-20 bg-stone-800 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : balances.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-stone-700 text-sm">No token balances found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {balances.map((token) => (
                <div
                  key={token.symbol}
                  className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-sm text-stone-400">
                        {token.icon}
                      </div>
                      <div>
                        <p className="text-stone-200 text-sm font-medium">{token.symbol}</p>
                        <p className="text-stone-600 text-xs">
                          ${token.price.toLocaleString("en-US", { maximumFractionDigits: token.price > 100 ? 0 : 4 })}
                          {token.change24h !== undefined && (
                            <span className={`ml-1.5 ${token.change24h >= 0 ? "text-emerald-500/60" : "text-red-500/60"}`}>
                              {token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(1)}%
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-stone-200 text-sm">{fmtUSD(token.value)}</p>
                      <p className="text-stone-600 text-xs">{fmt(token.balance, token.symbol === "WBTC" ? 6 : 4)}</p>
                    </div>
                  </div>

                  {/* Allocation bar */}
                  {totalUSD > 0 && (
                    <div className="mt-3 h-0.5 bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold-500/30 rounded-full"
                        style={{ width: `${Math.min(100, (token.value / totalUSD) * 100).toFixed(1)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Swap", href: "/" },
            { label: "History", href: "/history" },
            { label: "Orders", href: "/orders" },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="py-2.5 text-center text-stone-500 hover:text-stone-300 border border-stone-800/60 hover:border-stone-700 rounded-xl text-xs transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Recent swaps */}
        {history.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-stone-600 text-[10px] tracking-widest uppercase">Recent Swaps</p>
              <Link href="/history" className="text-stone-700 hover:text-stone-500 text-[10px] transition-colors">
                View all →
              </Link>
            </div>
            <div className="space-y-1.5">
              {history.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between px-5 py-3 bg-stone-900/20 border border-stone-800/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-500 text-xs">{TOKEN_ICONS[rec.fromToken] ?? "?"}</span>
                    <span className="text-stone-400 text-xs">{rec.fromToken}</span>
                    <span className="text-stone-700 text-[10px]">→</span>
                    <span className="text-stone-400 text-xs">{rec.toToken}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-stone-500 text-xs">{rec.amount} {rec.fromToken}</p>
                    <p className="text-stone-700 text-[10px]">{timeAgo(rec.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
