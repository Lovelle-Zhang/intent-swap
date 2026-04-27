"use client";

import type { ParsedIntent } from "@/app/preview/page";

const TOKEN_ICONS: Record<string, string> = {
  ETH: "Ξ", USDC: "$", DAI: "◈", WBTC: "₿", USDT: "₮", ARB: "⬡",
};

interface Props {
  intent: ParsedIntent;
  slippage: number;
  address?: string;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-800/50 last:border-0">
      <span className="text-stone-600 text-xs uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-stone-300 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

export function SwapPreviewCard({ intent, slippage, address }: Props) {
  const fromIcon = TOKEN_ICONS[intent.fromToken] ?? "?";
  const toIcon = TOKEN_ICONS[intent.toToken] ?? "?";

  const amountDisplay =
    intent.amount === null ? "—"
    : intent.amountType === "percentage" ? `${intent.amount}% of balance`
    : intent.amountType === "max" ? "Max balance"
    : `${intent.amount} ${intent.fromToken}`;

  return (
    <div className="bg-stone-900/30 border border-stone-800/60 rounded-2xl overflow-hidden">
      {/* 资产流向 */}
      <div className="px-6 py-6 flex items-center justify-between bg-gradient-to-b from-stone-900/60 to-transparent">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-stone-800/60 border border-stone-700/50 flex items-center justify-center text-xl">
            {fromIcon}
          </div>
          <div className="text-stone-300 text-sm font-medium">{intent.fromToken}</div>
        </div>

        <div className="flex-1 flex items-center justify-center gap-1 px-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-700 to-transparent" />
          <span className="text-stone-600 text-xs">via Uniswap V3</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-700 to-transparent" />
        </div>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-stone-800/60 border border-stone-700/50 flex items-center justify-center text-xl">
            {toIcon}
          </div>
          <div className="text-stone-300 text-sm font-medium">{intent.toToken}</div>
        </div>
      </div>

      {/* 详情 */}
      <div className="px-6 pb-2">
        <Row label="Amount" value={amountDisplay} />
        <Row label="Slippage" value={`${slippage}%`} />
        <Row label="Network" value="Arbitrum One" />
        <Row label="Wallet" value={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"} mono />
      </div>

      {/* AI 摘要 */}
      {intent.summary && (
        <div className="px-6 py-3 border-t border-stone-800/40">
          <p className="text-stone-700 text-xs italic">{intent.summary}</p>
        </div>
      )}
    </div>
  );
}
