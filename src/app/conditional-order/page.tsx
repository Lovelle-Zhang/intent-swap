"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ParsedIntent } from "@/app/preview/page";
import { useWebPush } from "@/hooks/useWebPush";

// ─── 订阅检查 ────────────────────────────────────────────────────────────────
function useSubscription() {
  const [status, setStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    const localStatus = localStorage.getItem("subscription-status");
    const localExpiry = Number(localStorage.getItem("subscription-expiry") ?? 0);

    if (localStatus === "active" && localExpiry > Date.now()) {
      setStatus("active");
      return;
    }

    // 本地过期或没有，去后端验证
    const email = localStorage.getItem("user-email");
    if (!email) { setStatus("inactive"); return; }

    fetch(`https://api.o-sheepps.com/subscriptions/check?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.active) {
          localStorage.setItem("subscription-status", "active");
          localStorage.setItem("subscription-expiry", String(data.expiresAt));
          setStatus("active");
        } else {
          localStorage.removeItem("subscription-status");
          setStatus("inactive");
        }
      })
      .catch(() => {
        // 网络失败时信任本地缓存（降级）
        setStatus(localStatus === "active" ? "active" : "inactive");
      });
  }, []);

  return status;
}

// Token list for condition selector
const TOKEN_ADDRESSES: Record<string, { address: string; decimals: number }> = {
  ETH:  { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
};

type Step = "form" | "submitting" | "done" | "error";

export default function ConditionalOrderPage() {
  const router = useRouter();
  const subStatus = useSubscription();

  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const { state: pushState, prepare: preparePush, bind: bindPush } = useWebPush();

  // Condition fields
  const [condToken, setCondToken] = useState("ETH");
  const [condOp, setCondOp] = useState<"above" | "below">("below");
  const [condPrice, setCondPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("conditional-order");
    if (!raw) {
      // 没有 intent 数据，但先等订阅状态确认
      // 如果未订阅，显示付费墙；如果已订阅，再跳回首页
      return;
    }
    const data = JSON.parse(raw);
    setIntent(data.intent);
    // 尝试从意图中预填条件
    if (data.intent?.condition) {
      const c = data.intent.condition;
      if (c.token) setCondToken(c.token);
      if (c.operator) setCondOp(c.operator);
      if (c.targetPrice) setCondPrice(String(c.targetPrice));
    }
    const savedEmail = localStorage.getItem("user-email") ?? "";
    setEmail(savedEmail);

    // 拉当前价格 — 优先 Binance（无需 key，无速率限制），降级 CoinGecko
    const fetchPrice = async () => {
      try {
        const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
        if (r.ok) {
          const d = await r.json();
          if (d.price) { setCurrentPrice(parseFloat(d.price)); return; }
        }
      } catch (_) {}
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        const d = await r.json();
        if (d.ethereum?.usd) setCurrentPrice(d.ethereum.usd);
      } catch (_) {}
    };
    fetchPrice();
  }, [router]);

  const handleSubmit = async () => {
    if (!intent) return;
    if (!condPrice || isNaN(Number(condPrice))) {
      setError("Please enter a valid target price");
      setStep("error");
      return;
    }
    setStep("submitting");
    setError("");

    try {
      if (email) localStorage.setItem("user-email", email);

      // 走 Next.js 服务端代理：那一层会验证订阅 + 附加 internal API key 转发到 monitor
      const submitRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || null,
          fromToken: intent.fromToken,
          toToken: intent.toToken,
          amount: intent.amount ?? 0.01,
          condition: {
            token: condToken,
            operator: condOp,
            targetPrice: Number(condPrice),
          },
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error ?? "Submit failed");

      setOrderId(submitData.id);
      setStep("done");
      // 订单创建成功后绑定 Push 订阅
      bindPush(submitData.id).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create order");
      setStep("error");
    }
  };

  // ─── 付费墙 ────────────────────────────────────────────────────────────────
  if (subStatus === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
      </main>
    );
  }

  if (subStatus === "inactive") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
              <span className="text-stone-600 text-xl">⚡</span>
            </div>
            <h1 className="text-stone-200 text-xl font-light">Pro Feature</h1>
            <p className="text-stone-500 text-sm leading-relaxed">
              Conditional orders are available to subscribers. Auto-execute swaps when your price target is hit.
            </p>
          </div>

          <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-2">
            {["Unlimited conditional orders", "Auto-execute on price trigger", "WeChat + browser notifications"].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <span className="text-gold-400/60 text-xs">✓</span>
                <span className="text-stone-400 text-sm">{f}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Link
              href="/subscribe"
              className="block w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors text-center"
            >
              Subscribe for $9.9 / month →
            </Link>
            <Link href="/" className="block text-center text-stone-700 hover:text-stone-500 text-xs transition-colors">
              ← Back to swap
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 已订阅但没有 intent 数据，跳回首页
  if (!intent) {
    if (typeof window !== "undefined") router.push("/");
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 animate-fade-in">
      <div className="w-full max-w-sm space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Link href="/" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">←</Link>
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Conditional Order</span>
            </div>
            <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
          </div>
          <h1 className="text-stone-200 text-lg font-light">Set trigger & auto-execute</h1>
          <p className="text-stone-600 text-xs mt-1">
            When the condition is met, your swap executes automatically on-chain.
          </p>
        </div>

        {step === "done" ? (
          // 成功态
          <div className="space-y-6">
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-full border border-stone-700 flex items-center justify-center mx-auto">
                <span className="text-gold-400 text-lg">✓</span>
              </div>
              <p className="text-stone-200 text-sm">Order created</p>
              <p className="text-stone-600 text-xs">
                Swap will execute automatically when {condToken}{" "}
                {condOp === "below" ? "drops below" : "rises above"}{" "}
                <span className="text-gold-400/70">${Number(condPrice).toLocaleString()}</span>
              </p>
              {orderId && (
                <p className="text-stone-700 text-[10px] font-mono">ID: {orderId}</p>
              )}
              {/* Web Push 状态 */}
              <div className="mt-1">
                {pushState === "subscribed" && (
                  <p className="text-gold-400/60 text-[11px]">🔔 Browser notifications enabled</p>
                )}
                {pushState === "denied" && (
                  <p className="text-amber-400/50 text-[11px]">Notifications blocked — check browser settings</p>
                )}
                {pushState === "requesting" && (
                  <p className="text-stone-600 text-[11px]">Enabling notifications...</p>
                )}
                {pushState === "unsupported" && (
                  <p className="text-stone-700 text-[11px]">Push not supported in this browser</p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Link href="/orders" className="flex-1 py-2.5 text-center text-stone-400 hover:text-stone-200 border border-stone-800 hover:border-stone-700 rounded-xl text-xs transition-colors">
                View orders
              </Link>
              <Link href="/" className="flex-1 py-2.5 text-center bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-xs transition-colors">
                New swap
              </Link>
            </div>
          </div>
        ) : step === "error" ? (
          <div className="space-y-4">
            <div className="bg-red-900/10 border border-red-800/30 rounded-xl px-5 py-4">
              <p className="text-red-400/80 text-sm">Something went wrong</p>
              <p className="text-red-400/50 text-xs mt-1 break-words">{error}</p>
            </div>
            <button onClick={() => setStep("form")} className="w-full py-2.5 text-stone-400 hover:text-stone-200 border border-stone-800 hover:border-stone-700 rounded-xl text-xs transition-colors">
              Try again
            </button>
          </div>
        ) : (
          // 表单态
          <div className="space-y-4">
            {/* 交易摘要 */}
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-2">
              <p className="text-stone-600 text-[10px] tracking-widest uppercase mb-3">Swap</p>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs">From</span>
                <span className="text-stone-300 text-sm">{intent.amount ?? "—"} {intent.fromToken}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs">To</span>
                <span className="text-stone-400 text-sm">{intent.toToken}</span>
              </div>
            </div>

            {/* 触发条件 */}
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 space-y-3">
              <p className="text-stone-500 text-[10px] tracking-widest uppercase">Trigger condition</p>
              <div className="flex gap-2">
                <select
                  value={condToken}
                  onChange={(e) => setCondToken(e.target.value)}
                  className="flex-1 bg-stone-900/80 border border-stone-700/60 rounded-lg px-3 py-2.5 text-stone-200 text-xs focus:outline-none focus:border-stone-500 transition-colors"
                >
                  {Object.keys(TOKEN_ADDRESSES).filter(t => t !== "WETH").map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={condOp}
                  onChange={(e) => setCondOp(e.target.value as "above" | "below")}
                  className="flex-1 bg-stone-900/80 border border-stone-700/60 rounded-lg px-3 py-2.5 text-stone-200 text-xs focus:outline-none focus:border-stone-500 transition-colors"
                >
                  <option value="below">drops below</option>
                  <option value="above">rises above</option>
                </select>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-light">$</span>
                <input
                  type="number"
                  value={condPrice}
                  onChange={(e) => setCondPrice(e.target.value)}
                  placeholder="Target price"
                  className="w-full bg-stone-900/80 border border-stone-700/60 rounded-lg pl-7 pr-4 py-2.5 text-stone-200 text-sm focus:outline-none focus:border-stone-500 transition-colors placeholder-stone-700"
                />
              </div>

              {/* 快捷价格选项 */}
              {condToken === "ETH" && currentPrice && (
                <div className="space-y-2 pt-1 border-t border-stone-800/60">
                  <div className="flex items-center justify-between">
                    <p className="text-stone-600 text-[10px] uppercase tracking-wider">Quick select</p>
                    <p className="text-stone-500 text-[11px]">Current price: <span className="text-stone-300 font-medium">${currentPrice.toLocaleString()}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(condOp === "below"
                      ? [
                          { label: "-5%",  price: Math.round(currentPrice * 0.95) },
                          { label: "-10%", price: Math.round(currentPrice * 0.90) },
                          { label: "-20%", price: Math.round(currentPrice * 0.80) },
                          { label: "-30%", price: Math.round(currentPrice * 0.70) },
                        ]
                      : [
                          { label: "+5%",  price: Math.round(currentPrice * 1.05) },
                          { label: "+10%", price: Math.round(currentPrice * 1.10) },
                          { label: "+20%", price: Math.round(currentPrice * 1.20) },
                          { label: "+50%", price: Math.round(currentPrice * 1.50) },
                        ]
                    ).map(({ label, price }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setCondPrice(String(price))}
                        className={`px-3 py-1.5 rounded-lg text-[11px] transition-all border ${
                          condPrice === String(price)
                            ? "bg-gold-500/20 text-gold-300 border-gold-500/40"
                            : "text-stone-400 hover:text-stone-200 border-stone-800 hover:border-stone-600 bg-stone-900/40"
                        }`}
                      >
                        <span className="text-stone-500">{label}</span> <span className="text-stone-300">${price.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 通知方式 */}
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 space-y-2.5">
              <p className="text-stone-500 text-[10px] tracking-widest uppercase">Notify me when triggered <span className="text-stone-700 normal-case tracking-normal font-normal">(optional)</span></p>

              {/* 浏览器推送 */}
              <button
                type="button"
                onClick={() => {
                  if (pushState === "idle") preparePush();
                }}
                disabled={pushState === "requesting" || pushState === "ready" || pushState === "subscribed" || pushState === "unsupported"}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs transition-colors ${
                  pushState === "subscribed"
                    ? "bg-gold-500/10 border-gold-500/30 text-gold-300"
                    : pushState === "ready"
                    ? "bg-stone-800/60 border-stone-600/50 text-stone-200"
                    : pushState === "denied"
                    ? "bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed"
                    : pushState === "requesting"
                    ? "bg-stone-900/40 border-stone-800/40 text-stone-500 cursor-wait"
                    : "bg-stone-900/60 border-stone-700/60 text-stone-300 hover:border-stone-600 hover:text-stone-200"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-base">{pushState === "subscribed" || pushState === "ready" ? "🔔" : "🔕"}</span>
                  <span>
                    {pushState === "subscribed" && "Browser notifications on"}
                    {pushState === "ready" && "Ready — activates on order creation"}
                    {pushState === "denied" && "Notifications blocked in browser settings"}
                    {pushState === "requesting" && "Requesting permission..."}
                    {pushState === "unsupported" && "Push not supported in this browser"}
                    {pushState === "idle" && "Enable browser notifications"}
                  </span>
                </span>
                {pushState === "idle" && <span className="text-stone-600 text-sm">→</span>}
              </button>

              {/* 邮件 */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="or enter email address"
                className="w-full bg-stone-900/60 border border-stone-700/60 rounded-xl px-4 py-3 text-stone-200 placeholder-stone-700 text-xs focus:outline-none focus:border-stone-500 transition-colors"
              />
            </div>

            {/* 按钮 */}
            {/* 提示 */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-gold-400/40 text-xs">⬡</span>
              <p className="text-stone-600 text-[11px]">
                Notified when triggered — you execute the swap. No pre-signing.
              </p>
            </div>

            {step === "submitting" ? (
              <div className="flex items-center justify-center gap-3 py-3">
                <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
                <p className="text-stone-500 text-sm">Creating order...</p>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!condPrice}
                className="w-full py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-30 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
              >
                Create Order
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
