"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import type { ParsedIntent } from "@/app/preview/page";

type Status = "idle" | "quoting" | "signing" | "confirming" | "success" | "error";

export default function ExecutePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const router = useRouter();
  const { address } = useAccount();

  const { sendTransaction, data: txHash } = useSendTransaction();
  const { isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) setStatus("success");
    if (isError) { setStatus("error"); setErrorMsg("Transaction failed on-chain."); }
  }, [isSuccess, isError]);

  useEffect(() => {
    if (txHash) setStatus("confirming");
  }, [txHash]);

  const execute = useCallback(async (parsed: ParsedIntent) => {
    if (!address) { setStatus("error"); setErrorMsg("Wallet not connected."); return; }
    setStatus("quoting");

    try {
      const res = await fetch("/api/swap-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: parsed.fromToken,
          toToken: parsed.toToken,
          amount: parsed.amount ?? 0.01,
          slippagePref: parsed.slippagePref,
          walletAddress: address,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");

      setStatus("signing");
      sendTransaction(
        {
          to: data.tx.to,
          data: data.tx.data,
          value: BigInt(data.tx.value ?? 0),
          gas: BigInt(data.tx.gas ?? 0),
        },
        {
          onError: (err) => {
            setStatus("error");
            const msg = (err as Error).message ?? "";
            setErrorMsg(
              msg.includes("rejected") || msg.includes("denied")
                ? "Transaction rejected."
                : "Swap failed. Please try again."
            );
          },
        }
      );
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }, [address, sendTransaction]);

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    const parsed = JSON.parse(raw) as ParsedIntent;
    setIntent(parsed);
    execute(parsed);
  }, [router, execute]);

  const steps = [
    { key: "quoting",    label: "Finding best route" },
    { key: "signing",    label: "Waiting for signature" },
    { key: "confirming", label: "Confirming on-chain" },
  ];
  const currentStep = steps.findIndex((s) => s.key === status);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-sm text-center space-y-8">

        {(status === "idle" || status === "quoting" || status === "signing" || status === "confirming") && (
          <>
            {/* 进度环 */}
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 border border-stone-800 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-t border-gold-500/60 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-stone-600 text-lg">
                {currentStep + 1}
              </div>
            </div>

            {/* 步骤列表 */}
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={step.key} className="flex items-center gap-3 justify-center">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < currentStep ? "bg-green-500/60"
                    : i === currentStep ? "bg-gold-500 animate-shimmer"
                    : "bg-stone-800"
                  }`} />
                  <span className={`text-sm transition-colors ${
                    i === currentStep ? "text-stone-300"
                    : i < currentStep ? "text-stone-600 line-through"
                    : "text-stone-700"
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {status === "signing" && (
              <p className="text-stone-700 text-xs">Check your wallet</p>
            )}
          </>
        )}

        {status === "success" && (
          <>
            <div className="text-gold-500 text-4xl animate-fade-in">✦</div>
            <div className="space-y-1 animate-fade-in">
              <p className="text-stone-200 font-medium">Swap complete</p>
              <p className="text-stone-600 text-sm">
                {intent?.fromToken} → {intent?.toToken}
              </p>
            </div>

            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 text-left space-y-2.5 animate-fade-in">
              <div className="flex justify-between text-sm">
                <span className="text-stone-600 text-xs uppercase tracking-wider">Tx Hash</span>
                <a
                  href={`https://arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-500/80 hover:text-gold-400 font-mono text-xs"
                >
                  {txHash?.slice(0, 10)}…{txHash?.slice(-6)}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600 text-xs uppercase tracking-wider">Status</span>
                <span className="text-green-400/80 text-xs">Confirmed</span>
              </div>
            </div>

            <Link
              href="/"
              className="block py-2.5 text-stone-600 hover:text-stone-400 text-sm transition-colors"
            >
              New swap →
            </Link>
          </>
        )}

        {status === "error" && (
          <div className="space-y-4 animate-fade-in">
            <div className="text-stone-700 text-3xl">✕</div>
            <p className="text-stone-400 text-sm">{errorMsg || "Swap failed."}</p>
            <button
              onClick={() => router.push("/preview")}
              className="text-stone-600 hover:text-stone-400 text-sm transition-colors"
            >
              ← Back to preview
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
