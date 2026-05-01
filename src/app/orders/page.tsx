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

export default function OrdersPage() {
  const [orders, setOrders] = useState<ConditionalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    // 从 localStorage 读取用户邮箱
    const savedEmail = localStorage.getItem("user-email");
    if (savedEmail) {
      setEmail(savedEmail);
      fetchOrders(savedEmail);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchOrders = async (userEmail: string) => {
    try {
      const res = await fetch(`https://api.o-sheepps.com/swap-orders?email=${encodeURIComponent(userEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    try {
      await fetch(`https://api.o-sheepps.com/swap-orders/${orderId}`, {
        method: "DELETE",
      });
      setOrders(orders.filter((o) => o.id !== orderId));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-stone-700 border-t-gold-500 rounded-full animate-spin" />
      </main>
    );
  }

  if (!email) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-stone-200 text-2xl font-light">Conditional Orders</h1>
          <p className="text-stone-600 text-sm">
            Enter your email to view your orders
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).email.value;
              if (input) {
                localStorage.setItem("user-email", input);
                setEmail(input);
                fetchOrders(input);
              }
            }}
            className="space-y-3"
          >
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 bg-stone-900/50 border border-stone-800 rounded-xl text-stone-200 placeholder-stone-700 focus:outline-none focus:border-gold-500/30"
            />
            <button
              type="submit"
              className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors"
            >
              View Orders
            </button>
          </form>
          <Link href="/" className="block text-stone-600 hover:text-stone-400 text-sm transition-colors">
            ← Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-stone-200 text-2xl font-light mb-1">Conditional Orders</h1>
            <p className="text-stone-600 text-sm">{email}</p>
          </div>
          <Link href="/" className="text-stone-600 hover:text-stone-400 text-sm transition-colors">
            ← Home
          </Link>
        </div>

        {/* Orders List */}
        {orders.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <div className="text-stone-700 text-3xl">○</div>
            <p className="text-stone-600 text-sm">No orders yet</p>
            <Link href="/" className="inline-block text-gold-500/80 hover:text-gold-400 text-sm transition-colors">
              Create your first order →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-stone-900/40 border border-stone-800/60 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-200 font-medium">
                        {order.fromToken} → {order.toToken}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          order.status === "pending"
                            ? "bg-stone-800 text-stone-400"
                            : order.status === "triggered"
                            ? "bg-green-900/30 text-green-400"
                            : "bg-stone-900 text-stone-600"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <p className="text-stone-600 text-sm">
                      Amount: {order.amount} {order.fromToken}
                    </p>
                  </div>
                  {order.status === "pending" && (
                    <button
                      onClick={() => handleCancel(order.id)}
                      className="text-stone-600 hover:text-red-400 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="bg-stone-900/60 rounded-lg px-3 py-2 text-sm">
                  <span className="text-stone-500">Condition: </span>
                  <span className="text-stone-300">
                    When {order.condition.token} goes{" "}
                    {order.condition.operator === "below" ? "below" : "above"} $
                    {order.condition.targetPrice.toLocaleString()}
                  </span>
                </div>

                <p className="text-stone-700 text-xs">
                  Created {new Date(order.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
