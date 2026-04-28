"use client";

import type { ParsedIntent } from "@/app/preview/page";

const TOKEN_ICONS: Record<string, string> = {
  ETH: "Ξ", USDC: "$", DAI: "◈", WBTC: "₿", USDT: "₮", ARB: "⬡",
};

interface Props {
  intent: ParsedIntent & { parsedBy?: "llm" | "rules" };
  slippage: number;
  address?: string;
  quote?: { amountOut: string; priceImpact?: string } | null;
  quoteLoading?: boolean;
  balance?: string;
}

function Row({ label, value, mono, highlight }: { label: string; value: React.ReactNode; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-800/50 last:border-0">
      <span className="text-stone-600 text-xs uppercase tracking-wider">{label}</span>
      <span className={`text-sm ${highlight ? "text-gold-400" : "text-stone-300"} ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function SwapPreviewCard({ intent, slippage, address, quote, quoteLoading, balance }: Props) {
  const fromIcon = TOKEN_ICONS[intent.fromToken] ?? "?";
  const toIcon = TOKEN_ICONS[intent.toToken] ?? "?";

  const amountDisplay =
    intent.amount === null ? "—"
    : intent.amountType === "percentage" ? `${intent.amount}% of balance`
    : intent.amountType === "max" ? "Max balance"
    : `${intent.amount} ${intent.fromToken}`;

  const receiveDisplay = quoteLoading
    ? <span className="text-stone-600 text-xs animate-pulse">Fetching…</span>
    : quote?.amountOut
    ? `≈ ${Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${intent.toToken}`
    : "—";

  return (
    <div className="bg-stone-900/30 border border-stone-800/60 rounded-2xl overflow-hidden">
      {/* 资产流向 */}
      <div className="px-6 py-6 flex items-center justify-between bg-gradient-to-b from-stone-900/60 to-transparent">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-stone-800/60 border border-stone-700/50 flex items-center justify-center text-xl">
            {fromIcon}
          </div>
          <div className="text-stone-300 text-sm font-medium">{intent.fromToken}</div>
          {intent.amount && (
            <div className="text-stone-600 text-xs">{intent.amount}</div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center gap-1 px-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-700 to-transparent" />
          <span className="text-stone-600 text-xs">→</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-700 to-transparent" />
        </div>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-stone-800/60 border border-stone-700/50 flex items-center justify-center text-xl">
            {toIcon}
          </div>
          <div className="text-stone-300 text-sm font-medium">{intent.toToken}</div>
          {quote?.amountOut && !quoteLoading && (
            <div className="text-gold-500/70 text-xs">
              ≈ {Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </div>
          )}
        </div>
      </div>

      {/* 详情 */}
      <div className="px-6 pb-2">
        <Row label="You pay" value={amountDisplay} />
        <Row label="You receive" value={receiveDisplay} highlight={!!quote?.amountOut && !quoteLoading} />
        <Row label="Slippage" value={`${slippage}%`} />
        <Row label="Route" value="Uniswap V3 · Arbitrum" />
        <Row label="Balance" value={balance ?? "—"} />
        <Row label="Wallet" value={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"} mono />
      </div>

      <div className="px-6 py-3 border-t border-stone-800/40 flex items-center justify-between gap-2">
        {intent.summary && (
          <p className="text-stone-700 text-xs italic flex-1">{intent.summary}</p>
        )}
        {intent.parsedBy && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
            intent.parsedBy === "llm"
              ? "text-emerald-500/70 border-emerald-800/50 bg-emerald-950/30"
              : "text-stone-600 border-stone-800/50"
          }`}>
            {intent.parsedBy === "llm" ? "✦ AI" : "rules"}
          </span>
        )}
      </div>
    </div>
  );
}
