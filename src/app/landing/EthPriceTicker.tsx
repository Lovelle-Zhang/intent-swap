"use client";

import { useEffect, useState } from "react";

export function EthPriceTicker() {
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const r = await fetch("https://api.o-sheepps.com/swap-prices");
        if (r.ok) {
          const d = await r.json();
          if (d.ETH) { setPrice(d.ETH.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); return; }
        }
      } catch (_) {}
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
        const d = await r.json();
        if (d.ethereum?.usd) setPrice(d.ethereum.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } catch (_) {}
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000); // 每分钟刷新
    return () => clearInterval(interval);
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
