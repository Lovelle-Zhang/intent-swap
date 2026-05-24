// Shared ETH price fetcher. Binance is preferred (no key, no rate limit,
// real-time). CoinGecko is the fallback (CDN-cached, slower, more reliable
// when Binance is geo-blocked).
//
// Callers receive a number or null — they decide how to display "unknown"
// rather than us silently substituting a stale fallback.

export async function fetchEthPrice(signal?: AbortSignal): Promise<number | null> {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", { signal });
    if (r.ok) {
      const d = await r.json();
      const v = parseFloat(d?.price);
      if (isFinite(v) && v > 0) return v;
    }
  } catch {
    if (signal?.aborted) return null;
  }
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { signal });
    if (r.ok) {
      const d = await r.json();
      const v = d?.ethereum?.usd;
      if (typeof v === "number" && v > 0) return v;
    }
  } catch { /* swallow */ }
  return null;
}
