"use client";

import { useState, useEffect, useRef } from "react";
import { useLoginWithEmail, useLoginWithOAuth, useConnectWallet } from "@privy-io/react-auth";

// Wallets surfaced in the custom picker. Order matters: most-likely-to-be-
// installed in our user base first. preSelectedWalletId values come from
// Privy's WalletListEntry union — passing one here tells Privy to skip its
// own picker and pop the wallet's native approval popup directly.
const WALLET_OPTIONS: { id: string; name: string; hint?: string; icon: string }[] = [
  { id: "metamask",      name: "MetaMask",     icon: "🦊" },
  { id: "okx_wallet",    name: "OKX Wallet",   icon: "⬛" },
  { id: "bitget_wallet", name: "Bitget",       icon: "▶" },
  { id: "base_account",  name: "Base Account", hint: "No install · passkey", icon: "🔵" },
  { id: "coinbase_wallet", name: "Coinbase Wallet", icon: "🅒" },
  { id: "rainbow",       name: "Rainbow",      icon: "🌈" },
  { id: "binance",       name: "Binance Wallet", icon: "🟡" },
  { id: "wallet_connect", name: "WalletConnect", hint: "Scan QR · last resort", icon: "🔗" },
];

/**
 * Custom login modal in the intent-swap aesthetic (stone + amber, quiet,
 * serif-leaning). Replaces Privy's default modal, which uses a SaaS-purple
 * palette that clashes with the rest of the app. Privy provides headless
 * hooks for the underlying auth flow — we only re-skin the UI.
 *
 * Three entry points:
 *   1. Google (one click → popup → connected)
 *   2. Email + 6-digit OTP code (no wallet required, embedded wallet created)
 *   3. "Use existing wallet" → bubbles up to the parent so it can open
 *      RainbowKit's modal instead.
 */
export function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"choose" | "wallets" | "code">("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const handleSuccess = () => {
    setBusy(false);
    setEmail("");
    setCode("");
    setError("");
    setStep("choose");
    onClose();
  };

  const handleError = (err: unknown) => {
    setBusy(false);
    setError(err instanceof Error ? err.message : "Something went wrong");
  };

  const { sendCode, loginWithCode } = useLoginWithEmail({
    onComplete: handleSuccess,
    onError: handleError,
  });

  const { initOAuth } = useLoginWithOAuth({
    onComplete: handleSuccess,
    onError: handleError,
  });

  const { connectWallet } = useConnectWallet({
    onSuccess: () => { setBusy(false); onClose(); },
    onError: (err) => handleError(err),
  });

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setStep("choose");
      setEmail("");
      setCode("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  // Auto-focus the code input when we land on the code step
  useEffect(() => {
    if (step === "code") {
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [step]);

  if (!open) return null;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setBusy(true);
    try {
      await sendCode({ email: email.trim() });
      setStep("code");
      setBusy(false);
    } catch (err) {
      handleError(err);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.replace(/\D/g, "");
    if (cleaned.length !== 6) return;
    setError("");
    setBusy(true);
    try {
      await loginWithCode({ code: cleaned });
      // onComplete will fire → handleSuccess
    } catch (err) {
      handleError(err);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setBusy(true);
    try {
      await initOAuth({ provider: "google" });
      // onComplete will fire after popup returns → handleSuccess
    } catch (err) {
      handleError(err);
    }
  };

  const handlePickWallet = (walletId: string) => {
    setError("");
    setBusy(true);
    try {
      connectWallet({ preSelectedWalletId: walletId });
      // onSuccess handler will fire after wallet approves
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-sm bg-stone-950 border border-stone-800/80 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full border border-stone-800 hover:border-stone-600 text-stone-500 hover:text-stone-300 flex items-center justify-center transition-colors text-xs"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="px-7 pt-9 pb-7">
          {step === "wallets" ? (
            <>
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded border border-gold-500/30 flex items-center justify-center">
                    <span className="text-gold-500/80 text-xs">⬡</span>
                  </div>
                  <span className="text-stone-500 text-[10px] tracking-[0.25em] uppercase">Intent Swap</span>
                </div>
                <h2 className="text-stone-100 text-lg font-light tracking-tight">Choose a wallet</h2>
                <p className="text-stone-500 text-xs mt-1.5">Connects directly · No QR needed</p>
              </div>

              <div className="space-y-2">
                {WALLET_OPTIONS.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handlePickWallet(w.id)}
                    disabled={busy}
                    className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-200 text-sm transition-colors flex items-center gap-3 px-3.5 disabled:opacity-50"
                  >
                    <span className="w-7 h-7 rounded-md bg-stone-800/80 border border-stone-700 flex items-center justify-center text-sm">
                      {w.icon}
                    </span>
                    <div className="flex-1 text-left">
                      <div>{w.name}</div>
                      {w.hint && <p className="text-stone-600 text-[10px] mt-0.5">{w.hint}</p>}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => { setStep("choose"); setError(""); }}
                className="w-full mt-5 py-2 text-stone-600 hover:text-stone-400 text-xs tracking-wide transition-colors"
              >
                ← Back
              </button>

              {error && (
                <p className="mt-3 text-red-400/70 text-xs text-center">{error}</p>
              )}
            </>
          ) : step === "choose" ? (
            <>
              {/* Header */}
              <div className="text-center mb-7">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded border border-gold-500/30 flex items-center justify-center">
                    <span className="text-gold-500/80 text-xs">⬡</span>
                  </div>
                  <span className="text-stone-500 text-[10px] tracking-[0.25em] uppercase">Intent Swap</span>
                </div>
                <h2 className="text-stone-100 text-lg font-light tracking-tight">Sign in</h2>
                <p className="text-stone-500 text-xs mt-1.5">Start trading in 30 seconds.</p>
              </div>

              <div className="space-y-3">
                {/* Existing wallet — equal-weight, first because most current
                    visitors are crypto-native and expect this path */}
                <button
                  onClick={() => setStep("wallets")}
                  className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-200 text-sm transition-colors flex items-center gap-3 px-4"
                >
                  <span className="w-7 h-7 rounded-md bg-stone-800/80 border border-stone-700 flex items-center justify-center text-base">👛</span>
                  <div className="flex-1 text-left">
                    <div>Connect a wallet</div>
                    <p className="text-stone-600 text-[10px] mt-0.5">MetaMask · OKX · Bitget · others</p>
                  </div>
                </button>

                {/* Google */}
                <button
                  onClick={handleGoogle}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-200 text-sm transition-colors flex items-center gap-3 px-4 disabled:opacity-50"
                >
                  <span className="w-7 h-7 rounded-md bg-stone-800/80 border border-stone-700 flex items-center justify-center">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </span>
                  <div className="flex-1 text-left">
                    <div>Continue with Google</div>
                    <p className="text-stone-600 text-[10px] mt-0.5">New to crypto? · 30 seconds</p>
                  </div>
                </button>

                {/* Email */}
                <form onSubmit={handleSendCode}>
                  <div className="flex items-center bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 rounded-xl overflow-hidden focus-within:border-gold-500/30 transition-colors">
                    <span className="w-7 h-7 rounded-md bg-stone-800/80 border border-stone-700 flex items-center justify-center text-base ml-3.5 my-3">✉️</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      disabled={busy}
                      autoComplete="email"
                      className="flex-1 bg-transparent pl-3 pr-2 py-3 text-stone-200 text-sm placeholder:text-stone-600 outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={busy || !email.trim()}
                      className="px-4 py-3 text-gold-400 hover:text-gold-300 text-xs tracking-wider transition-colors disabled:opacity-30 disabled:hover:text-gold-400"
                    >
                      {busy ? "..." : "Send code →"}
                    </button>
                  </div>
                </form>
              </div>

              {error && (
                <p className="mt-4 text-red-400/70 text-xs text-center">{error}</p>
              )}

              <p className="mt-6 text-stone-700 text-[10px] text-center tracking-wide">
                Non-custodial · Your keys, your funds
              </p>
            </>
          ) : (
            <>
              {/* Code step */}
              <div className="text-center mb-7">
                <h2 className="text-stone-100 text-lg font-light tracking-tight">Check your inbox</h2>
                <p className="text-stone-500 text-xs mt-1.5">
                  6-digit code sent to <span className="text-stone-400">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyCode}>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  disabled={busy}
                  className="w-full bg-stone-900/40 border border-stone-800 focus:border-gold-500/40 rounded-xl px-4 py-3 text-stone-100 text-lg text-center tracking-[0.5em] font-mono outline-none transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={busy || code.replace(/\D/g, "").length !== 6}
                  className="w-full mt-4 py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium text-sm rounded-xl transition-colors disabled:opacity-40 disabled:hover:bg-gold-500"
                >
                  {busy ? "Verifying..." : "Verify & continue"}
                </button>
              </form>

              <button
                onClick={() => { setStep("choose"); setCode(""); setError(""); }}
                className="w-full mt-4 py-2 text-stone-600 hover:text-stone-400 text-xs tracking-wide transition-colors"
              >
                ← Use a different email
              </button>

              {error && (
                <p className="mt-3 text-red-400/70 text-xs text-center">{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
