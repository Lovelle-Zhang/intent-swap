"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "Swap 0.1 ETH to USDC",
  "When ETH drops to 3000, buy 0.1 ETH",
  "500 USDC to ARB, low slippage",
];

export function IntentInput() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: value }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      sessionStorage.setItem("intent-preview", JSON.stringify({ raw: value, ...data }));
      router.push("/preview");
    } catch {
      setError("Could not parse your intent. Try rephrasing.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit}>
        <div className={`relative rounded-2xl transition-all duration-300 ${
          focused
            ? "shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_40px_rgba(245,158,11,0.04)]"
            : "shadow-[0_0_0_1px_rgba(68,64,60,0.6)]"
        }`}>
          <div className={`absolute top-0 left-8 right-8 h-px transition-all duration-500 ${
            focused
              ? "bg-gradient-to-r from-transparent via-gold-500/30 to-transparent"
              : "bg-gradient-to-r from-transparent via-stone-700/50 to-transparent"
          }`} />

          <div className="bg-stone-900/50 rounded-2xl px-6 pt-5 pb-4 backdrop-blur-sm">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Describe your swap intent..."
              rows={3}
              className="w-full bg-transparent text-stone-200 placeholder-stone-700 resize-none focus:outline-none text-base leading-relaxed font-light"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
            />

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-800/50">
              <span className="text-stone-700 text-xs">
                {value.length > 0 ? `${value.length} chars` : "Enter to submit"}
              </span>
              <button
                type="submit"
                disabled={loading || !value.trim()}
                className="flex items-center gap-2 px-4 py-1.5 bg-stone-800/80 hover:bg-stone-700/80 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-700/50 hover:border-stone-600 text-stone-300 text-xs rounded-lg transition-all duration-200"
              >
                {loading ? (
                  <>
                    <span className="w-3 h-3 border border-stone-600 border-t-gold-500/60 rounded-full animate-spin" />
                    Analyzing
                  </>
                ) : (
                  <>Analyze →</>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-400/70 text-xs px-2 mt-2">{error}</p>
        )}
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setValue(ex)}
            className="text-xs text-stone-700 hover:text-stone-500 border border-stone-800/80 hover:border-stone-700 rounded-lg px-3 py-1.5 transition-all duration-200 hover:bg-stone-900/40"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}


const EXAMPLES = [
  "Swap 0.1 ETH to USDC",
  "When ETH drops to 3000, buy 0.1 ETH",
  "500 USDC to ARB, low slippage",
];

export function IntentInput() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const { isConnected } = useAccount();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: value }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      sessionStorage.setItem("intent-preview", JSON.stringify({ raw: value, ...data }));
      router.push("/preview");
    } catch {
      setError("Could not parse your intent. Try rephrasing.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit}>
        {/* 输入容器 */}
        <div className={`relative rounded-2xl transition-all duration-300 ${
          focused
            ? "shadow-[0_0_0_1px_rgba(245,158,11,0.2),0_0_40px_rgba(245,158,11,0.04)]"
            : "shadow-[0_0_0_1px_rgba(68,64,60,0.6)]"
        }`}>
          {/* 顶部装饰线 */}
          <div className={`absolute top-0 left-8 right-8 h-px transition-all duration-500 ${
            focused
              ? "bg-gradient-to-r from-transparent via-gold-500/30 to-transparent"
              : "bg-gradient-to-r from-transparent via-stone-700/50 to-transparent"
          }`} />

          <div className="bg-stone-900/50 rounded-2xl px-6 pt-5 pb-4 backdrop-blur-sm">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Describe your swap intent..."
              rows={3}
              className="w-full bg-transparent text-stone-200 placeholder-stone-700 resize-none focus:outline-none text-base leading-relaxed font-light"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
            />

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-800/50">
              <span className="text-stone-700 text-xs">
                {value.length > 0 ? `${value.length} chars` : "Enter to submit"}
              </span>

              {isConnected ? (
                <button
                  type="submit"
                  disabled={loading || !value.trim()}
                  className="flex items-center gap-2 px-4 py-1.5 bg-stone-800/80 hover:bg-stone-700/80 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-700/50 hover:border-stone-600 text-stone-300 text-xs rounded-lg transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <span className="w-3 h-3 border border-stone-600 border-t-gold-500/60 rounded-full animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>Analyze →</>
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !value.trim()}
                  className="flex items-center gap-2 px-4 py-1.5 bg-stone-800/80 hover:bg-stone-700/80 disabled:opacity-30 disabled:cursor-not-allowed border border-stone-700/50 hover:border-stone-600 text-stone-300 text-xs rounded-lg transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <span className="w-3 h-3 border border-stone-600 border-t-gold-500/60 rounded-full animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>Analyze →</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-400/70 text-xs px-2 mt-2">{error}</p>
        )}
      </form>

      {/* 示例标签 */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setValue(ex)}
            className="text-xs text-stone-700 hover:text-stone-500 border border-stone-800/80 hover:border-stone-700 rounded-lg px-3 py-1.5 transition-all duration-200 hover:bg-stone-900/40"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
