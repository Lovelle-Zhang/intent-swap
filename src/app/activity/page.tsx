"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getHistory, removeRecord, clearHistory, getExplorerUrl, getExplorerName, type SwapRecord } from "@/lib/history";
import { getArchivedIds, archive, unarchive } from "@/lib/archivedOrders";
import { TOKEN_ICONS, CHAIN_NAMES } from "@/config/tokens";

// ─── Types ────────────────────────────────────────────────────────────────

interface ConditionalOrder {
  id: string;
  email: string | null;
  fromToken: string;
  toToken: string;
  amount: number;
  condition: { token: string; operator: "above" | "below"; targetPrice: number };
  triggered?: boolean;
  status: "pending" | "triggered" | "cancelled";
  createdAt: number;
  triggeredAt?: number;
  txHash?: string;
}

type ActivityItem =
  | { kind: "swap"; ts: number; data: SwapRecord }
  | { kind: "order"; ts: number; data: ConditionalOrder };

type Filter = "all" | "swaps" | "orders";

// ─── Helpers ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:   "text-gold-400/70 border-gold-800/40",
  triggered: "text-emerald-400/70 border-emerald-800/40",
  cancelled: "text-stone-600 border-stone-800",
  swap:      "text-stone-400/70 border-stone-700/50",
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function normalizeOrders(raw: Array<Partial<ConditionalOrder> & { triggered?: boolean }>): ConditionalOrder[] {
  return raw.map((o) => ({
    ...o,
    status: (o.status as ConditionalOrder["status"]) ?? (o.triggered ? "triggered" : "pending"),
  }) as ConditionalOrder);
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-5 py-8 md:py-12"><div className="max-w-xl mx-auto text-stone-600 text-sm">Loading…</div></main>}>
      <ActivityContent />
    </Suspense>
  );
}

function ActivityContent() {
  const [swaps, setSwaps] = useState<SwapRecord[]>([]);
  const [orders, setOrders] = useState<ConditionalOrder[]>([]);
  const [email, setEmail] = useState("");
  const [inputEmail, setInputEmail] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const searchParams = useSearchParams();

  // Apply ?filter= from URL on mount (so /history → /activity?filter=swaps still does what users expect)
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "swaps" || f === "orders" || f === "all") setFilter(f);
  }, [searchParams]);

  // Load local data + saved email on mount
  useEffect(() => {
    setSwaps(getHistory());
    setArchivedIds(getArchivedIds());
    const saved = localStorage.getItem("user-email");
    if (saved) { setEmail(saved); fetchOrders(saved); }
  }, []);

  const fetchOrders = async (userEmail: string) => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/orders?email=${encodeURIComponent(userEmail)}`);
      if (res.ok) setOrders(normalizeOrders((await res.json()).orders ?? []));
    } catch { /* ignore */ }
    finally { setOrdersLoading(false); }
  };

  // Build unified timeline
  const items: ActivityItem[] = useMemo(() => {
    const swapItems: ActivityItem[] = swaps.map((s) => ({ kind: "swap", ts: s.timestamp, data: s }));
    const orderItems: ActivityItem[] = orders.map((o) => ({ kind: "order", ts: o.createdAt, data: o }));
    const combined = [...swapItems, ...orderItems];
    combined.sort((a, b) => b.ts - a.ts);
    return combined;
  }, [swaps, orders]);

  const visibleItems = items.filter((it) => {
    if (filter === "swaps" && it.kind !== "swap") return false;
    if (filter === "orders" && it.kind !== "order") return false;
    if (!showArchived && it.kind === "order" && archivedIds.has(it.data.id)) return false;
    return true;
  });
  const hiddenCount = items.filter((it) => it.kind === "order" && archivedIds.has(it.data.id)).length;

  // ─── Actions ───────────────────────────────────────────────────────────

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail) return;
    localStorage.setItem("user-email", inputEmail);
    setEmail(inputEmail);
    fetchOrders(inputEmail);
  };

  const handleChangeEmail = () => {
    localStorage.removeItem("user-email");
    setEmail("");
    setOrders([]);
    setInputEmail("");
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      if (res.ok) setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch { /* ignore */ }
  };

  const handleArchive = (orderId: string) => {
    archive(orderId);
    setArchivedIds(new Set([...archivedIds, orderId]));
  };

  const handleUnarchive = (orderId: string) => {
    unarchive(orderId);
    const next = new Set(archivedIds);
    next.delete(orderId);
    setArchivedIds(next);
  };

  const handleRemoveSwap = (id: string) => {
    removeRecord(id);
    setSwaps((prev) => prev.filter((s) => s.id !== id));
  };

  const handleClearSwaps = () => {
    clearHistory();
    setSwaps([]);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen px-5 py-8 md:py-12">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Activity</span>
            </div>
            <p className="text-stone-500 text-xs">
              {visibleItems.length} item{visibleItems.length !== 1 ? "s" : ""}
              {email ? <> · {email}</> : null}
              {hiddenCount > 0 && !showArchived && (
                <button onClick={() => setShowArchived(true)} className="ml-2 text-stone-700 hover:text-stone-500 underline underline-offset-2 transition-colors">
                  + {hiddenCount} hidden
                </button>
              )}
              {showArchived && hiddenCount > 0 && (
                <button onClick={() => setShowArchived(false)} className="ml-2 text-stone-700 hover:text-stone-500 underline underline-offset-2 transition-colors">
                  hide dismissed
                </button>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {swaps.length > 0 && (
              <button onClick={handleClearSwaps} className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
                Clear swaps
              </button>
            )}
            {email && (
              <button onClick={handleChangeEmail} className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
                Change email
              </button>
            )}
            <Link href="/" className="text-stone-600 hover:text-stone-400 text-xs tracking-wide transition-colors">
              ← Back
            </Link>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 mb-6">
          {(["all", "swaps", "orders"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs tracking-wide transition-colors ${
                filter === f
                  ? "bg-stone-800 text-stone-200 border border-stone-700"
                  : "text-stone-500 hover:text-stone-300 border border-transparent"
              }`}
            >
              {f === "all" ? "All" : f === "swaps" ? "Swaps" : "Triggers"}
            </button>
          ))}
        </div>

        {/* Email entry banner (only if no email and filter would show orders) */}
        {!email && filter !== "swaps" && (
          <form onSubmit={handleSubmitEmail} className="mb-6 bg-stone-900/30 border border-stone-800/50 rounded-xl px-4 py-3 space-y-2.5">
            <p className="text-stone-400 text-xs">Enter your email to see conditional-order triggers.</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 px-3 py-2 bg-stone-950/60 border border-stone-800/60 rounded-lg text-stone-200 placeholder-stone-700 focus:outline-none focus:border-stone-600 text-xs transition-colors"
              />
              <button type="submit" className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-lg transition-colors">
                Load
              </button>
            </div>
          </form>
        )}

        {/* Empty state */}
        {visibleItems.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
              <span className="text-stone-700 text-lg">✦</span>
            </div>
            <p className="text-stone-600 text-sm">
              {ordersLoading
                ? "Loading…"
                : !email && filter !== "swaps"
                ? "Enter your email above to load conditional orders"
                : "Nothing here yet"}
            </p>
            {(email || filter === "swaps") && (
              <Link href="/" className="inline-block text-stone-700 hover:text-stone-500 text-xs transition-colors">
                Set your first trade →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleItems.map((it) => {
              if (it.kind === "swap") {
                const r = it.data;
                const fromIcon = TOKEN_ICONS[r.fromToken] ?? "?";
                const toIcon = TOKEN_ICONS[r.toToken] ?? "?";
                const chainName = r.chainId ? CHAIN_NAMES[r.chainId] : "Ethereum";
                const explorerUrl = getExplorerUrl(r.txHash, r.chainId);
                const explorerName = getExplorerName(r.chainId);
                const priceImpact = r.priceImpact ? parseFloat(r.priceImpact) : null;
                const highImpact = priceImpact !== null && priceImpact > 3;
                return (
                  <div key={`s-${r.id}`} className="group bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-stone-500 text-sm">{fromIcon}</span>
                        <span className="text-stone-300 text-sm font-medium">{r.amount} {r.fromToken}</span>
                        <span className="text-stone-700 text-xs">→</span>
                        <span className="text-stone-500 text-sm">{toIcon}</span>
                        <span className="text-stone-400 text-sm">{r.toToken}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] border rounded-md px-2 py-0.5 ${STATUS_STYLES.swap}`}>swap</span>
                        <span className="text-stone-700 text-xs">{timeAgo(r.timestamp)}</span>
                        <button
                          onClick={() => handleRemoveSwap(r.id)}
                          aria-label="Remove from history"
                          title="Remove from history"
                          className="text-stone-700 hover:text-red-400/70 text-base leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {r.amountOut && (
                        <div className="flex justify-between">
                          <span className="text-stone-600 text-xs">Received</span>
                          <span className="text-gold-400/70 text-xs font-mono">{parseFloat(r.amountOut).toFixed(6)} {r.toToken}</span>
                        </div>
                      )}
                      {priceImpact !== null && (
                        <div className="flex justify-between">
                          <span className="text-stone-600 text-xs">Price impact</span>
                          <span className={`text-xs ${highImpact ? "text-red-400/80" : "text-stone-500"}`}>{priceImpact.toFixed(2)}%{highImpact ? " ⚠" : ""}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-stone-600 text-xs">Network</span>
                        <span className="text-stone-500 text-xs">{chainName}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-stone-800/40">
                      <span className="text-stone-700 text-xs font-mono">{r.txHash.slice(0, 10)}…{r.txHash.slice(-6)}</span>
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-gold-500/50 hover:text-gold-400/80 text-xs transition-colors">
                        {explorerName} ↗
                      </a>
                    </div>
                  </div>
                );
              }

              // it.kind === "order"
              const order = it.data;
              const fromIcon = TOKEN_ICONS[order.fromToken] ?? "?";
              const toIcon = TOKEN_ICONS[order.toToken] ?? "?";
              const isArchived = archivedIds.has(order.id);
              return (
                <div
                  key={`o-${order.id}`}
                  className={`group bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-3 ${isArchived ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-500 text-sm">{fromIcon}</span>
                      <span className="text-stone-300 text-sm font-medium">{order.fromToken}</span>
                      <span className="text-stone-700 text-xs">→</span>
                      <span className="text-stone-500 text-sm">{toIcon}</span>
                      <span className="text-stone-400 text-sm">{order.toToken}</span>
                    </div>
                    <span className={`text-[10px] border rounded-md px-2 py-0.5 ${STATUS_STYLES[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-stone-600 text-xs">Trigger</span>
                      <span className="text-stone-300 text-xs">
                        {order.condition.token}{" "}
                        {order.condition.operator === "below" ? "drops below" : "rises above"}{" "}
                        <span className="text-gold-400/70">${order.condition.targetPrice.toLocaleString()}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600 text-xs">Amount</span>
                      <span className="text-stone-400 text-xs">{order.amount} {order.fromToken}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600 text-xs">Created</span>
                      <span className="text-stone-600 text-xs">{timeAgo(order.createdAt)}</span>
                    </div>
                  </div>
                  {(order.status === "pending" || order.status === "triggered") && (
                    <div className="pt-1 border-t border-stone-800/40 flex justify-end gap-4">
                      {order.status === "pending" && (
                        <button onClick={() => handleCancelOrder(order.id)} className="text-stone-700 hover:text-red-400/70 text-xs transition-colors">
                          Cancel order
                        </button>
                      )}
                      {order.status === "triggered" && !isArchived && (
                        <button onClick={() => handleArchive(order.id)} className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
                          Dismiss
                        </button>
                      )}
                      {isArchived && (
                        <button onClick={() => handleUnarchive(order.id)} className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
                          Restore
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
