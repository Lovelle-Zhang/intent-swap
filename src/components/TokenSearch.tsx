"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface TokenInfo {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface Props {
  chainId?: number;
  onSelect: (token: TokenInfo) => void;
  placeholder?: string;
}

// 缓存 token list
let cachedTokens: TokenInfo[] | null = null;

async function loadTokenList(chainId: number): Promise<TokenInfo[]> {
  if (cachedTokens) return cachedTokens.filter((t) => t.chainId === chainId);
  try {
    const res = await fetch("https://tokens.uniswap.org");
    const data = await res.json();
    cachedTokens = data.tokens ?? [];
    return cachedTokens!.filter((t) => t.chainId === chainId);
  } catch {
    return [];
  }
}

function highlight(text: string, query: string): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + "«" + text.slice(idx, idx + query.length) + "»" + text.slice(idx + query.length);
}

export function TokenSearch({ chainId = 1, onSelect, placeholder = "Search token name, symbol or address..." }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenInfo[]>([]);
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 加载 token list
  useEffect(() => {
    setLoading(true);
    loadTokenList(chainId).then((tokens) => {
      setAllTokens(tokens);
      setLoading(false);
    });
  }, [chainId]);

  // 搜索逻辑
  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    // 地址搜索
    if (q.startsWith("0x") && q.length >= 10) {
      const found = allTokens.filter((t) => t.address.toLowerCase().includes(lower));
      setResults(found.slice(0, 8));
      return;
    }
    // 符号/名称搜索，符号优先
    const bySymbol = allTokens.filter((t) => t.symbol.toLowerCase().startsWith(lower));
    const byName = allTokens.filter(
      (t) => t.name.toLowerCase().includes(lower) && !t.symbol.toLowerCase().startsWith(lower)
    );
    setResults([...bySymbol, ...byName].slice(0, 8));
  }, [allTokens]);

  useEffect(() => { search(query); }, [query, search]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (token: TokenInfo) => {
    onSelect(token);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className={`flex items-center gap-2 px-3 py-2 bg-stone-900/40 border rounded-xl transition-colors ${
        open ? "border-stone-700" : "border-stone-800/60 hover:border-stone-700"
      }`}>
        <svg className="w-3.5 h-3.5 text-stone-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? "Loading tokens..." : placeholder}
          disabled={loading}
          className="flex-1 bg-transparent text-stone-300 placeholder-stone-700 text-xs focus:outline-none min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }} className="text-stone-700 hover:text-stone-500 text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl overflow-hidden"
          style={{ zIndex: 9999 }}
        >
          {results.map((token) => {
            const symbolHl = highlight(token.symbol, query);
            const nameHl = highlight(token.name, query);
            return (
              <button
                key={`${token.chainId}-${token.address}`}
                onClick={() => handleSelect(token)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-800/50 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-xs text-stone-400 shrink-0 font-mono">
                  {token.symbol.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-200 text-xs font-medium">
                    {symbolHl.replace(/«(.+?)»/g, (_, m) => m).split("").map((c, i) => (
                      symbolHl.indexOf("«") <= i && i < symbolHl.indexOf("»") ? (
                        <span key={i} className="text-gold-400">{c}</span>
                      ) : <span key={i}>{c}</span>
                    ))}
                  </p>
                  <p className="text-stone-600 text-[11px] truncate">{token.name}</p>
                </div>
                <span className="text-stone-700 text-[10px] font-mono shrink-0">
                  {token.address.slice(0, 6)}…{token.address.slice(-4)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length > 2 && results.length === 0 && !loading && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 bg-stone-900 border border-stone-800 rounded-xl shadow-xl px-4 py-3"
          style={{ zIndex: 9999 }}
        >
          <p className="text-stone-600 text-xs text-center">No tokens found</p>
        </div>
      )}
    </div>
  );
}
