"use client";

import { useEffect, useState } from "react";
import { fetchEthPrice } from "@/lib/prices";

export function EthPriceTicker() {
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const v = await fetchEthPrice();
      if (!cancelled && v !== null) {
        setPrice(v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-stone-950/60 border border-stone-800/40 rounded-lg">
      <span className="text-stone-500 text-[11px]">Current ETH price</span>
      <span className="text-stone-300 text-[11px] font-mono">
        {price ? `$${price}` : <span className="text-stone-600 animate-pulse">loading…</span>}
      </span>
    </div>
  );
}
