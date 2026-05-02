"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ConditionalOrder {
  id: string;
  email: string;
  fromToken: string;
  toToken: string;
  amount: number;
  condition: {
    token: string;
    operator: "above" | "below";
    targetPrice: number;
  };
  status: "pending" | "triggered" | "cancelled";
  createdAt: number;
}

const TOKEN_ICONS: Record<string, string> = {
  ETH: "Ξ", USDC: "$", DAI: "◈", WBTC: "₿", USDT: "₮", ARB: "⬡", WETH: "Ξ",
};

const STATUS_STYLES: Record<string, string> = {
  pending:   "text-gold-400/70 border-gold-800/40",
  triggered: "text-emerald-400/70 border-emerald-800/40",
  cancelled: "text-stone-600 border-stone-800",
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<ConditionalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inputEmail, setInputEmail] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("user-email");
    if (saved) { setEmail(saved); fetchOrders(saved); }
    else setLoading(false);
  }, []);

  const fetchOrders = async (userEmail: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.o-sheepps.com/swap-orders?email=${encodeURIComponent(userEmail)}`);
      if (res.ok) setOrders((await res.json()).orders ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputEmail) return;
    localStorage.setItem("user-email", inputEmail);
    setEmail(inputEmail);
    fetchOrders(inputEmail);
  };

  const handleCancel = async (orderId: string) => {
    try {
      await fetch(`https://api.o-sheepps.com/swap-orders/${orderId}`, { method: "DELETE" });
      setOrders(orders.filter((o) => o.id !== orderId));
    } catch { /* ignore */ }
  };

  const handleChangeEmail = () => {
    localStorage.removeItem("user-email");
    setEmail("");
    setOrders([]);
    setInputEmail("");
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
      </main>
    );
  }

  // Email input state
  if (!email) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Orders</span>
            </div>
            <h1 className="text-stone-200 text-xl font-light">Conditional Orders</h1>
            <p className="text-stone-600 text-sm">Enter your email to view active orders.</p>
          </div>

          <form onSubmit={handleSubmitEmail} className="space-y-3">
            <input
              type="email"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 bg-stone-900/40 border border-stone-800/60 rounded-xl text-stone-200 placeholder-stone-700 focus:outline-none focus:border-stone-600 text-sm transition-colors"
            />
            <button
              type="submit"
              className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors"
            >
              View Orders
            </button>
          </form>

          <Link href="/" className="block text-center text-stone-700 hover:text-stone-500 text-xs transition-colors">
            ← Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 md:py-12">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Orders</span>
            </div>
            <p className="text-stone-500 text-xs">
              {orders.length} order{orders.length !== 1 ? "s" : ""} · {email}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleChangeEmail}
              className="text-stone-700 hover:text-stone-500 text-xs transition-colors"
            >
              Change
            </button>
            <Link href="/" className="text-stone-600 hover:text-stone-400 text-xs tracking-wide transition-colors">
              ← Back
            </Link>
          </div>
        </div>

        {/* Empty state */}
        {orders.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
              <span className="text-stone-700 text-lg">○</span>
            </div>
            <p className="text-stone-600 text-sm">No orders yet</p>
            <Link href="/" className="inline-block text-stone-700 hover:text-stone-500 text-xs transition-colors">
              Create your first order →
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((order) => {
              const fromIcon = TOKEN_ICONS[order.fromToken] ?? "?";
              const toIcon = TOKEN_ICONS[order.toToken] ?? "?";
              return (
                <div
                  key={order.id}
                  className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-3"
                >
                  {/* Top row */}
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

                  {/* Condition */}
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

                  {/* Cancel */}
                  {order.status === "pending" && (
                    <div className="pt-1 border-t border-stone-800/40 flex justify-end">
                      <button
                        onClick={() => handleCancel(order.id)}
                        className="text-stone-700 hover:text-red-400/70 text-xs transition-colors"
                      >
                        Cancel order
                      </button>
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
