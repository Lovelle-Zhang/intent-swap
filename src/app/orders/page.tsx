"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Order {
  id: number;
  createdAt: string;
  raw: string;
  fromToken: string;
  toToken: string;
  amount: number | null;
  condition: { token: string; operator: "above" | "below"; targetPrice: number };
  summary: string;
  status: "active" | "triggered" | "cancelled";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setOrders(JSON.parse(localStorage.getItem("intent-orders") ?? "[]").reverse());
  }, []);

  function cancel(id: number) {
    const updated = orders.map((o) => o.id === id ? { ...o, status: "cancelled" as const } : o);
    setOrders(updated);
    localStorage.setItem("intent-orders", JSON.stringify([...updated].reverse()));
  }

  return (
    <main className="min-h-screen flex flex-col px-4 py-12 animate-fade-in">
      <div className="w-full max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-stone-500 text-xs tracking-widest uppercase">My Orders</p>
            <p className="text-stone-300 text-sm mt-0.5">{orders.filter(o => o.status === "active").length} active</p>
          </div>
          <Link href="/" className="text-stone-600 hover:text-stone-400 text-sm transition-colors">
            + New intent
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-stone-700 text-sm">No orders yet</p>
            <Link href="/" className="text-stone-600 hover:text-stone-400 text-xs transition-colors">
              Set your first conditional order →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className={`bg-stone-900/30 border rounded-xl px-5 py-4 space-y-3 transition-opacity ${
                  order.status === "cancelled" ? "border-stone-800/30 opacity-40" : "border-stone-800/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-stone-300 text-sm leading-relaxed">{order.summary}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    order.status === "active" ? "bg-green-500/10 text-green-400/70"
                    : order.status === "triggered" ? "bg-gold-500/10 text-gold-400/70"
                    : "bg-stone-800 text-stone-600"
                  }`}>
                    {order.status}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-stone-700 text-xs">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                  {order.status === "active" && (
                    <button
                      onClick={() => cancel(order.id)}
                      className="text-stone-700 hover:text-stone-500 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
