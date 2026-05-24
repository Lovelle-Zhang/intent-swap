"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const USDT_ADDRESS = "0x0f10A63a15c9E0825A67d2858cC8dB0042155D17";
const USDT_AMOUNT = "9.9";
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

type Step = "idle" | "submitting" | "success" | "error";

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [txHash, setTxHash] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("user-email");
    if (saved) setEmail(saved);
    const sub = localStorage.getItem("subscription-status");
    if (sub === "active") setIsSubscribed(true);
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText(USDT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !txHash) return;

    setStep("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("https://api.o-sheepps.com/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, txHash }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Verification failed");
      }

      localStorage.setItem("user-email", email);
      localStorage.setItem("subscription-status", "active");
      localStorage.setItem("subscription-expiry", String(data.expiresAt));
      setIsSubscribed(true);
      setStep("success");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Verification failed");
      setStep("error");
    }
  };

  if (isSubscribed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="w-14 h-14 rounded-full border border-gold-800/50 flex items-center justify-center mx-auto">
            <span className="text-gold-400 text-2xl">✓</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-stone-200 text-xl font-light">Active Subscription</h1>
            <p className="text-stone-500 text-sm">Conditional orders are unlocked.</p>
          </div>
          <Link
            href="/conditional-order"
            className="block w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors text-center"
          >
            Create Conditional Order →
          </Link>
          <Link href="/" className="block text-stone-700 hover:text-stone-500 text-xs transition-colors">
            ← Back to swap
          </Link>
        </div>
      </main>
    );
  }

  if (step === "success") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="w-14 h-14 rounded-full border border-gold-800/50 flex items-center justify-center mx-auto">
            <span className="text-gold-400 text-2xl">✓</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-stone-200 text-xl font-light">Welcome aboard</h1>
            <p className="text-stone-500 text-sm">Your subscription is now active. Conditional orders unlocked.</p>
          </div>
          <Link
            href="/conditional-order"
            className="block w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors text-center"
          >
            Create your first order →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-12">
      <div className="w-full max-w-sm space-y-10">

        {/* Beta banner — no need to pay during beta */}
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-3 space-y-1">
          <p className="text-emerald-400 text-xs font-medium">✓ Free during beta</p>
          <p className="text-stone-400 text-[11px] leading-relaxed">
            Conditional orders are currently free for everyone. No payment needed — just go
            to <Link href="/" className="underline underline-offset-2 hover:text-stone-200">the app</Link> and set a trigger.
            Auto-execute is coming; we&apos;ll switch to a per-trigger fee then.
          </p>
        </div>

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">←</Link>
            <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Subscribe (optional)</span>
          </div>
          <h1 className="text-stone-200 text-2xl font-light">Conditional Orders</h1>
          <p className="text-stone-500 text-sm leading-relaxed">
            Support early development with an optional payment. Subscribers will get priority
            access to auto-execute when it ships.
          </p>
        </div>

        {/* Plan card */}
        <div className="bg-stone-900/40 border border-stone-800/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-stone-200 text-base font-medium">Pro</p>
              <p className="text-stone-600 text-xs mt-0.5">Monthly subscription</p>
            </div>
            <div className="text-right">
              <p className="text-gold-400 text-2xl font-light">$9.9</p>
              <p className="text-stone-600 text-xs">/ month</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/40 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[11px] font-medium tracking-wide">Currently free · $0 during beta</span>
          </div>

          <div className="border-t border-stone-800/50 pt-4 space-y-2.5">
            {[
              "Unlimited conditional orders",
              "Auto-execute on price trigger",
              "Multi-condition support",
              "WeChat + browser notifications",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <span className="text-gold-400/60 text-xs">✓</span>
                <span className="text-stone-400 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment instructions */}
        <div className="space-y-4">
          {/* Why this flow */}
          <div className="bg-stone-900/30 border border-stone-800/40 rounded-xl px-4 py-3 space-y-1">
            <p className="text-stone-400 text-xs font-medium">Why on-chain payment?</p>
            <p className="text-stone-600 text-[11px] leading-relaxed">
              No accounts, no credit cards. You pay directly from your wallet — we verify on-chain automatically. No middleman, no chargebacks.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-stone-400 text-xs tracking-wide uppercase">Step 1 — Send USDT</p>
            <p className="text-stone-600 text-xs">
              Send exactly <span className="text-gold-400/80">{USDT_AMOUNT} USDT</span> (ERC-20, Ethereum mainnet) to:
            </p>
          </div>

          {/* Address box */}
          <div
            onClick={copyAddress}
            className="bg-stone-900/60 border border-stone-800/60 rounded-xl px-4 py-3 cursor-pointer hover:border-stone-700/60 transition-colors group"
          >
            <p className="text-stone-400 font-mono text-[11px] break-all leading-relaxed group-hover:text-stone-300 transition-colors">
              {USDT_ADDRESS}
            </p>
            <p className="text-stone-700 text-[10px] mt-2 group-hover:text-stone-500 transition-colors">
              {copied ? "✓ Copied" : "Click to copy"}
            </p>
          </div>

          {/* Quick send + Etherscan */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* MetaMask deep link only resolves on mobile — hide on md+ so desktop users don't get a dead button */}
            <a
              href={`https://metamask.app.link/send/${USDT_CONTRACT}@1/transfer?address=${USDT_ADDRESS}&uint256=9900000`}
              target="_blank"
              rel="noopener noreferrer"
              className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-stone-900/60 border border-stone-700/60 hover:border-stone-600 rounded-lg text-stone-400 hover:text-stone-200 text-[11px] transition-colors"
            >
              <span>🦊</span> Open in MetaMask
            </a>
            <a
              href={`https://etherscan.io/token/${USDT_CONTRACT}?a=${USDT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-700 hover:text-stone-500 text-[11px] transition-colors"
            >
              View on Etherscan ↗
            </a>
            <span className="hidden md:inline text-stone-700 text-[11px]">
              On desktop? Just paste this address into your wallet's Send screen.
            </span>
          </div>
        </div>

        {/* Verify form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-stone-400 text-xs tracking-wide uppercase">Step 2 — Confirm payment</p>

          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 bg-stone-900/40 border border-stone-800/60 rounded-xl text-stone-200 placeholder-stone-700 focus:outline-none focus:border-stone-600 text-sm transition-colors"
            />
            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value.trim())}
              placeholder="Transaction hash (0x...)"
              required
              className="w-full px-4 py-3 bg-stone-900/40 border border-stone-800/60 rounded-xl text-stone-200 placeholder-stone-700 focus:outline-none focus:border-stone-600 text-sm font-mono transition-colors"
            />
          </div>

          {step === "error" && (
            <p className="text-red-400/70 text-xs px-1">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={step === "submitting"}
            className="w-full py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
          >
            {step === "submitting" ? "Verifying..." : "Verify & Activate"}
          </button>

          <p className="text-stone-700 text-[11px] text-center leading-relaxed">
            Payment goes directly to the{" "}
            <a
              href={`https://etherscan.io/address/${USDT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-600 hover:text-stone-400 underline underline-offset-2 transition-colors"
            >
              protocol wallet
            </a>
            . Subscription activates automatically after on-chain verification (&lt;1 min).
          </p>
        </form>

        <Link href="/" className="block text-center text-stone-700 hover:text-stone-500 text-xs transition-colors">
          ← Back to swap
        </Link>
      </div>
    </main>
  );
}
