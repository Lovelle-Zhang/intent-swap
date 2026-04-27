"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";

interface ConditionalIntent {
  raw: string;
  intentType: "conditional";
  fromToken: string;
  toToken: string;
  amount: number | null;
  amountType: string | null;
  condition: {
    token: string;
    operator: "above" | "below";
    targetPrice: number;
  };
  summary: string;
}

export default function NewOrderPage() {
  const [intent, setIntent] = useState<ConditionalIntent | null>(null);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const { address } = useAccount();

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    const parsed = JSON.parse(raw);
    if (parsed.intentType !== "conditional") { router.push("/preview"); return; }
    setIntent(parsed);
  }, [router]);

  if (!intent) return null;

  const { condition, fromToken, toToken, amount, summary } = intent;

  function handleSave() {
    // 存到 localStorage（后续可同步到后端）
    const orders = JSON.parse(localStorage.getItem("intent-orders") ?? "[]");
    orders.push({
      id: Date.now(),
      createdAt: new Date().toISOString(),
      wallet: address,
      raw: intent!.raw,
      fromToken,
      toToken,
      amount,
      condition,
      summary,
      status: "active",
      notifyEmail: email,
    });
    localStorage.setItem("intent-orders", JSON.stringify(orders));

    // 同步到后端监控服务
    const monitorUrl = process.env.NEXT_PUBLIC_MONITOR_URL;
    if (monitorUrl) {
      fetch(`${monitorUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orders[orders.length - 1]),
      }).catch(() => {}); // 静默失败，不影响本地保存
    }

    setSaved(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 animate-fade-in">
      <div className="w-full max-w-md space-y-6">

        <div className="text-center space-y-1">
          <p className="text-stone-500 text-xs tracking-widest uppercase">Conditional Order</p>
          <p className="text-stone-400 text-sm italic">"{intent.raw}"</p>
        </div>

        {/* 条件卡片 */}
        <div className="bg-stone-900/30 border border-stone-800/60 rounded-2xl overflow-hidden">
          {/* 触发条件 */}
          <div className="px-6 py-5 bg-gradient-to-b from-stone-900/60 to-transparent text-center space-y-2">
            <p className="text-stone-600 text-xs uppercase tracking-wider">Trigger when</p>
            <p className="text-stone-200 text-lg font-light">
              {condition.token} {condition.operator === "below" ? "drops below" : "rises above"}{" "}
              <span className="text-gold-400">${condition.targetPrice.toLocaleString()}</span>
            </p>
          </div>

          {/* 执行动作 */}
          <div className="px-6 py-4 border-t border-stone-800/40 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-stone-600 text-xs uppercase tracking-wider">Action</span>
              <span className="text-stone-300">{fromToken} → {toToken}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600 text-xs uppercase tracking-wider">Amount</span>
              <span className="text-stone-300">{amount ?? "—"} {fromToken}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600 text-xs uppercase tracking-wider">Wallet</span>
              <span className="text-stone-500 font-mono text-xs">
                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}
              </span>
            </div>
          </div>

          {/* 通知邮箱 */}
          <div className="px-6 py-4 border-t border-stone-800/40">
            <p className="text-stone-600 text-xs uppercase tracking-wider mb-2">Notify me at</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com (optional)"
              className="w-full bg-stone-900/40 border border-stone-800 rounded-lg px-3 py-2 text-stone-300 placeholder-stone-700 text-sm focus:outline-none focus:border-stone-600 transition-colors"
            />
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-stone-900/20 border border-stone-800/40 rounded-xl px-4 py-3">
          <p className="text-stone-600 text-xs leading-relaxed">
            We'll monitor the price and notify you when the condition is met.
            You'll need to confirm the swap manually — your funds stay in your wallet.
          </p>
        </div>

        {saved ? (
          <div className="text-center space-y-3 animate-fade-in">
            <p className="text-green-400/80 text-sm">✓ Order saved</p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/orders")}
                className="flex-1 py-3 border border-stone-700 hover:border-stone-600 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
              >
                View orders
              </button>
              <button
                onClick={() => router.push("/")}
                className="flex-1 py-3 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-sm transition-colors"
              >
                New intent
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
            >
              ← Revise
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors"
            >
              Set Order
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
