"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance, useChainId, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { SwapPreviewCard } from "@/components/SwapPreviewCard";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { resolveTokenAddress } from "@/config/tokens";
import { fetchEthPrice } from "@/lib/prices";

export interface ParsedIntent {
  raw: string;
  fromToken: string;
  toToken: string;
  amount: number | null;
  amountType: "exact" | "percentage" | "max" | null;
  slippagePref: "low" | "normal" | "high";
  summary: string;
  intentType?: "swap" | "conditional";
  condition?: { token: string; operator: "above" | "below"; targetPrice: number };
  parsedBy?: "llm" | "rules";
}

const SLIPPAGE_MAP = { low: 0.5, normal: 1.0, high: 3.0 };

export default function PreviewPage() {
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [slippagePref, setSlippagePref] = useState<"low" | "normal" | "high">("normal");
  const [quote, setQuote] = useState<{ amountOut: string; priceImpact?: string; route?: string[]; hops?: number } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);

  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // 支持的链。用户在哪条就操作哪条；未连钱包时落回 Ethereum 用作显示。
  const SUPPORTED_CHAINS = [mainnet.id, 42161, 59144];
  const TARGET_CHAIN_ID = isConnected && SUPPORTED_CHAINS.includes(chainId) ? chainId : mainnet.id;
  const isWrongChain = isConnected && !SUPPORTED_CHAINS.includes(chainId);

  // 余额查询：只在正确链上查
  const isNativeETH = intent?.fromToken === "ETH";
  const tokenAddress = intent && !isNativeETH
    ? resolveTokenAddress(intent.fromToken, TARGET_CHAIN_ID)
    : undefined;

  const { data: balance } = useBalance({
    address: address,
    chainId: TARGET_CHAIN_ID,
    ...(tokenAddress ? { token: tokenAddress } : {}),
    query: { enabled: !!address && !!intent && !isWrongChain },
  });

  // 计算实际 swap 数量
  const resolvedAmount = (() => {
    if (!intent) return null;
    const bal = balance ? Number(balance.formatted) : null;
    if (intent.amountType === "max") {
      if (bal === null) return null;
      return intent.fromToken === "ETH" ? Math.max(0, bal - 0.005) : bal;
    }
    if (intent.amountType === "percentage" && bal !== null && intent.amount !== null) {
      return (bal * intent.amount) / 100;
    }
    return intent.amount;
  })();

  const insufficientBalance =
    balance !== undefined && resolvedAmount !== null && resolvedAmount !== undefined && resolvedAmount > 0
      ? Number(balance.formatted) < resolvedAmount
      : false;

  useEffect(() => {
    const raw = sessionStorage.getItem("intent-preview");
    if (!raw) { router.push("/"); return; }
    const parsed = JSON.parse(raw) as ParsedIntent;
    setIntent(parsed);
    setSlippagePref(parsed.slippagePref ?? "normal");
  }, [router]);

  useEffect(() => {
    // 修复：条件单模式下，即使 resolvedAmount 为 null 也要获取报价（用占位值）
    if (!intent) return;
    const isConditionalMode = intent.intentType === "conditional";
    const amountForQuote = isConditionalMode && resolvedAmount === null ? 100 : resolvedAmount;
    if (!amountForQuote || intent.fromToken === intent.toToken) return;

    setQuoteLoading(true);
    setQuote(null);
    setGasEstimate(null);

    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/swap-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromToken: intent.fromToken,
            toToken: intent.toToken,
            amount: amountForQuote,
            slippagePref,
            walletAddress: address ?? "0x0000000000000000000000000000000000000001",
            quoteOnly: true,
            chainId: TARGET_CHAIN_ID,
          }),
          signal: ac.signal,
        });
        const data = await res.json();
        if (ac.signal.aborted) return;

        if (data.amountOut || data.toAmount) {
          setQuote({
            amountOut: data.amountOut ?? data.toAmount,
            priceImpact: data.priceImpact,
            route: data.route,
            hops: data.hops,
          });
        }

        if (address) {
          const isNative = intent.fromToken === "ETH";
          const baseGas = isNative ? 21000 : 65000;
          const currentChain = chainId || TARGET_CHAIN_ID;
          const gasPrice = currentChain === 42161 ? 0.1 : currentChain === 59144 ? 0.05 : 30;
          const ethPrice = await fetchEthPrice(ac.signal);
          if (ac.signal.aborted) return;
          if (ethPrice !== null) {
            const gasCostUSD = (baseGas * gasPrice * ethPrice) / 1e9;
            setGasEstimate(`~$${gasCostUSD.toFixed(2)}`);
          } else {
            setGasEstimate("—");
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      } finally {
        if (!ac.signal.aborted) setQuoteLoading(false);
      }
    })();

    return () => ac.abort();
  }, [intent, slippagePref, resolvedAmount, address, chainId, TARGET_CHAIN_ID]);

  if (!intent) return null;

  // 修复：条件单模式下，resolvedAmount 可能为 null，需要用占位值
  const isConditional = intent.intentType === "conditional";
  const displayAmount = isConditional && resolvedAmount === null ? 100 : resolvedAmount;
  const slippage = SLIPPAGE_MAP[slippagePref];

  const handleConfirm = () => {
    if (isConditional) {
      // 条件单：跳转到条件单提交页面
      sessionStorage.setItem("conditional-order", JSON.stringify({
        intent,
        slippagePref,
        resolvedAmount: displayAmount, // 使用 displayAmount
        quote,
        gasEstimate,
      }));
      router.push("/conditional-order");
    } else {
      // 立即执行：跳转到执行页
      const updated = { ...intent, slippagePref, amount: resolvedAmount ?? intent.amount };
      sessionStorage.setItem("intent-preview", JSON.stringify(updated));
      router.push("/execute");
    }
  };

  // 渲染主 UI（立即执行 + 条件单都用同一个预览卡片）
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 animate-fade-in">
      <div className="w-full max-w-md space-y-6">

        {/* 顶部：钱包连接状态 */}
        <div className="flex justify-end">
          <ConnectButton />
        </div>

        <div className="text-center space-y-1">
          <p className="text-stone-500 text-xs tracking-widest uppercase">
            {isConditional ? "Review your trigger" : "Review your swap"}
          </p>
          <p className="text-stone-400 text-sm italic">"{intent.raw}"</p>
        </div>

        <SwapPreviewCard
          intent={intent}
          slippage={slippage}
          address={address}
          quote={quote}
          quoteLoading={quoteLoading}
          balance={balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : undefined}
          resolvedAmount={displayAmount} // 修复：使用 displayAmount
          chainId={TARGET_CHAIN_ID}
          gasEstimate={gasEstimate}
        />

        {/* 路由路径 */}
        {quote?.route && quote.route.length > 1 && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-stone-700 text-[10px] tracking-widest uppercase">Route</span>
            <div className="flex items-center gap-1 ml-2">
              {quote.route.map((token, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className={`text-xs ${i === 0 || i === quote.route!.length - 1 ? "text-stone-400" : "text-gold-400/60"}`}>
                    {token}
                  </span>
                  {i < quote.route!.length - 1 && (
                    <span className="text-stone-700 text-[10px]">→</span>
                  )}
                </span>
              ))}
              {quote.hops === 2 && (
                <span className="text-stone-700 text-[10px] ml-1">· multi-hop</span>
              )}
            </div>
          </div>
        )}

        {/* Price impact 警告 */}
        {quote?.priceImpact && parseFloat(quote.priceImpact) > 1 && (
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
            parseFloat(quote.priceImpact) > 5
              ? "bg-red-950/30 border-red-800/40"
              : "bg-amber-950/30 border-amber-800/40"
          }`}>
            <p className={`text-xs ${parseFloat(quote.priceImpact) > 5 ? "text-red-400/80" : "text-amber-400/80"}`}>
              Price impact: {parseFloat(quote.priceImpact).toFixed(2)}%
              {parseFloat(quote.priceImpact) > 5 ? " — High impact, proceed with caution" : ""}
            </p>
          </div>
        )}

        {/* 滑点调节 */}
        <div className="flex items-center justify-between px-1">
          <span className="text-stone-600 text-xs">Slippage</span>
          <div className="flex gap-1">
            {(["low", "normal", "high"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSlippagePref(opt)}
                className={`px-3 py-1 rounded-lg text-xs transition-colors ${
                  slippagePref === opt
                    ? "bg-gold-500/20 text-gold-400 border border-gold-500/40"
                    : "text-stone-600 hover:text-stone-400 border border-transparent"
                }`}
              >
                {opt === "low" ? "0.5%" : opt === "normal" ? "1%" : "3%"}
              </button>
            ))}
          </div>
        </div>

        {/* 余额显示 */}
        <div className="px-1">
          {!isConnected ? (
            <div className="flex items-center gap-2 py-2 px-3 bg-stone-900/40 border border-stone-800/40 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-400/50 shrink-0" />
              <p className="text-stone-500 text-xs">
                Preview mode — connect wallet to check balance & execute
              </p>
            </div>
          ) : (
            <p className="text-stone-600 text-xs">
              {balance
                ? `Balance: ${Number(balance.formatted).toFixed(4)} ${balance.symbol} · Ethereum Mainnet`
                : "Loading balance..."}
            </p>
          )}
        </div>

        {/* 链不匹配：显示切换按钮 */}
        {isWrongChain && (
          <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800/40 rounded-xl px-4 py-3">
            <p className="text-amber-400/80 text-xs">
              Unsupported network — switch to Ethereum, Arbitrum, or Linea.
            </p>
            <button
              onClick={() => switchChain({ chainId: mainnet.id })}
              disabled={isSwitching}
              className="text-amber-400 hover:text-amber-300 text-xs font-medium disabled:opacity-50 transition-colors ml-4 shrink-0"
            >
              {isSwitching ? "Switching..." : "Use Ethereum →"}
            </button>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex-1 py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
          >
            ← Revise
          </button>

          {!isConnected ? (
            // 未连接：显示连接按钮
            <div className="flex-1">
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button
                    onClick={openConnectModal}
                    className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors"
                  >
                    Connect wallet
                  </button>
                )}
              </ConnectButton.Custom>
            </div>
          ) : isWrongChain ? (
            // 链不对：禁用 Confirm
            <button
              disabled
              className="flex-1 py-3 bg-gold-500/40 cursor-not-allowed text-stone-950/60 font-medium rounded-xl text-sm"
            >
              Wrong network
            </button>
          ) : (
            // 链正确：正常 Confirm
            <button
              onClick={handleConfirm}
              disabled={insufficientBalance}
              className="flex-1 py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
            >
              {insufficientBalance ? "Insufficient balance" : isConditional ? "Set trigger →" : "Confirm & Swap"}
            </button>
          )}
        </div>

        <p className="text-center text-stone-700 text-xs">
          {isConditional
            ? "Final rate is determined at trigger time. Slippage applies."
            : "Rates are estimates. Final amount may vary within slippage tolerance."}
        </p>
      </div>
    </main>
  );
}
