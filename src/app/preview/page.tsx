"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance, useChainId, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { SwapPreviewCard } from "@/components/SwapPreviewCard";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const TOKEN_ADDRESSES: Record<number, Record<string, `0x${string}`>> = {
  1: {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  42161: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI:  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    ARB:  "0x912CE59144191C1204E64559FE8253a0e49E6548",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  59144: {
    USDC: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    USDT: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    DAI:  "0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5",
    WBTC: "0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b2",
    WETH: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
  },
};

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
  const [quote, setQuote] = useState<{ amountOut: string; priceImpact?: string } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);

  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // 目标链：固定 Ethereum Mainnet
  const TARGET_CHAIN_ID = mainnet.id; // 1
  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  // 余额查询：只在正确链上查
  const isNativeETH = intent?.fromToken === "ETH";
  const tokenAddress = intent && !isNativeETH
    ? (TOKEN_ADDRESSES[TARGET_CHAIN_ID]?.[intent.fromToken] ?? undefined)
    : undefined;

  const { data: balance } = useBalance({
    address: address,
    chainId: TARGET_CHAIN_ID,
    ...(tokenAddress ? { token: tokenAddress } : {}),
    query: { enabled: !!address && !!intent },
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

  // 修复：条件单模式下，resolvedAmount 可能为 null，需要用占位值
  const displayAmount = isConditional && resolvedAmount === null ? 100 : resolvedAmount;

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
    const amountForQuote = isConditional && resolvedAmount === null ? 100 : resolvedAmount;
    if (!intent || !amountForQuote || intent.fromToken === intent.toToken) return;
    
    setQuoteLoading(true);
    setQuote(null);
    setGasEstimate(null);
    
    fetch("/api/swap-quote", {
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
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.amountOut || data.toAmount) {
          setQuote({ amountOut: data.amountOut ?? data.toAmount });
        }
        // Gas 估算（简化版：根据链和操作类型估算）
        if (address) {
          const isNative = intent.fromToken === "ETH";
          const baseGas = isNative ? 21000 : 65000; // native transfer vs ERC20 swap
          const currentChain = chainId || TARGET_CHAIN_ID;
          const gasPrice = currentChain === 42161 ? 0.1 : currentChain === 59144 ? 0.05 : 30; // Gwei
          const ethPrice = 3500; // 简化：固定 ETH 价格
          const gasCostUSD = (baseGas * gasPrice * ethPrice) / 1e9;
          setGasEstimate(`~$${gasCostUSD.toFixed(2)}`);
        }
      })
      .catch(() => {})
      .finally(() => setQuoteLoading(false));
  }, [intent, slippagePref, resolvedAmount, address, TARGET_CHAIN_ID, isConditional]);

  if (!intent) return null;

  const isConditional = intent.intentType === "conditional";
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
          <p className="text-stone-500 text-xs tracking-widest uppercase">Review your swap</p>
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
          <p className="text-stone-600 text-xs">
            {balance
              ? `Balance: ${Number(balance.formatted).toFixed(4)} ${balance.symbol} · Ethereum Mainnet`
              : isConnected
              ? "Loading balance..."
              : "Connect wallet to see balance"}
          </p>
        </div>

        {/* 链不匹配：显示切换按钮 */}
        {isWrongChain && (
          <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800/40 rounded-xl px-4 py-3">
            <p className="text-amber-400/80 text-xs">
              Switch to Ethereum Mainnet to swap
            </p>
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
              disabled={isSwitching}
              className="text-amber-400 hover:text-amber-300 text-xs font-medium disabled:opacity-50 transition-colors ml-4 shrink-0"
            >
              {isSwitching ? "Switching..." : "Switch →"}
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
              {insufficientBalance ? "Insufficient balance" : "Confirm & Swap"}
            </button>
          )}
        </div>

        <p className="text-center text-stone-700 text-xs">
          Rates are estimates. Final amount may vary within slippage tolerance.
        </p>
      </div>
    </main>
  );
}
