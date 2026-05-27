// Shared spot price fetcher. Binance is preferred (no key, no rate limit,
// real-time). CoinGecko is the fallback (CDN-cached, slower, more reliable
// when Binance is geo-blocked).
//
// Callers receive a number or null — they decide how to display "unknown"
// rather than us silently substituting a stale fallback.

// symbol → { binance: "<PAIR>", coingecko: "<id>", stable?: number }
const PRICE_MAP: Record<string, { binance?: string; coingecko?: string; stable?: number }> = {
  ETH:  { binance: "ETHUSDT",  coingecko: "ethereum" },
  WETH: { binance: "ETHUSDT",  coingecko: "ethereum" },
  BTC:  { binance: "BTCUSDT",  coingecko: "bitcoin" },
  WBTC: { binance: "BTCUSDT",  coingecko: "wrapped-bitcoin" },
  ARB:  { binance: "ARBUSDT",  coingecko: "arbitrum" },
  // Stablecoins — return the peg value rather than burning a network call
  USDC: { stable: 1 },
  USDT: { stable: 1 },
  DAI:  { stable: 1 },
};

export async function fetchEthPrice(signal?: AbortSignal): Promise<number | null> {
  return fetchTokenPrice("ETH", signal);
}

export async function fetchTokenPrice(symbol: string, signal?: AbortSignal): Promise<number | null> {
  const cfg = PRICE_MAP[symbol.toUpperCase()];
  if (!cfg) return null;
  if (typeof cfg.stable === "number") return cfg.stable;
  if (cfg.binance) {
    try {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cfg.binance}`, { signal });
      if (r.ok) {
        const d = await r.json();
        const v = parseFloat(d?.price);
        if (isFinite(v) && v > 0) return v;
      }
    } catch {
      if (signal?.aborted) return null;
    }
  }
  if (cfg.coingecko) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cfg.coingecko}&vs_currencies=usd`, { signal });
      if (r.ok) {
        const d = await r.json();
        const v = d?.[cfg.coingecko]?.usd;
        if (typeof v === "number" && v > 0) return v;
      }
    } catch { /* swallow */ }
  }
  return null;
}
