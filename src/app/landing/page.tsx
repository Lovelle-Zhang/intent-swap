import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Intent Swap — Swap with intention",
  description: "The first DeFi swap that understands what you mean. Natural language intents, conditional orders, and MEV protection — all in one.",
};

const FEATURES = [
  {
    icon: "◎",
    title: "Natural Language",
    desc: "Type what you want. \"Swap 0.5 ETH to USDC with low slippage\" — and it happens.",
  },
  {
    icon: "◈",
    title: "Conditional Orders",
    desc: "\"When ETH drops to $3000, buy.\" Set it, forget it. Auto-executes on-chain when conditions are met.",
  },
  {
    icon: "⬡",
    title: "MEV Protected",
    desc: "Transactions routed through Flashbots. No sandwich attacks. You get the price you see.",
  },
  {
    icon: "≋",
    title: "Smart Routing",
    desc: "Multi-hop paths across 1700+ tokens. We find the best route so you don't have to.",
  },
  {
    icon: "◷",
    title: "Portfolio View",
    desc: "All your token balances, prices, and swap history in one place. No wallet-juggling.",
  },
  {
    icon: "∿",
    title: "Multi-chain",
    desc: "Ethereum, Arbitrum, Linea. More chains coming. One interface, everywhere.",
  },
];

const STEPS = [
  { num: "01", title: "Describe your intent", body: "Type naturally — amount, tokens, conditions. No dropdowns. No confusion." },
  { num: "02", title: "Preview & confirm", body: "See the exact route, price impact, and estimated gas before you sign anything." },
  { num: "03", title: "Done", body: "Swap executes. You receive tokens. History is logged. That's it." },
];

const STATS = [
  { value: "1,700+", label: "Tokens supported" },
  { value: "3", label: "Chains" },
  { value: "0%", label: "Protocol fee" },
  { value: "< 2s", label: "Intent parse time" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-200">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-stone-950/80 backdrop-blur-md border-b border-stone-900">
        <span className="text-stone-300 text-sm font-medium tracking-wide">⬡ INTENT SWAP</span>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-stone-600 hover:text-stone-400 text-xs tracking-widest uppercase transition-colors hidden md:block">Features</a>
          <a href="#how" className="text-stone-600 hover:text-stone-400 text-xs tracking-widest uppercase transition-colors hidden md:block">How it works</a>
          <Link
            href="/"
            className="px-4 py-1.5 bg-gold-500 hover:bg-gold-400 text-stone-950 text-xs font-medium rounded-lg transition-colors"
          >
            Launch App →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* Background glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-96 h-96 rounded-full bg-gold-500/3 blur-3xl" />
        </div>

        <div className="relative space-y-8 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-900/60 border border-stone-800 rounded-full text-stone-500 text-[10px] tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
            Live on Ethereum · Arbitrum · Linea
          </div>

          <h1 className="text-4xl md:text-6xl font-light text-stone-100 leading-tight tracking-tight">
            Swap with<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-stone-500 to-gold-400 pr-2">
              intention
            </span>
          </h1>

          <p className="text-stone-500 text-lg md:text-xl font-light max-w-xl mx-auto leading-relaxed">
            The first DeFi interface that understands what you mean.
            Natural language. Conditional orders. MEV protection.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/"
              className="px-8 py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-gold-500/20"
            >
              Start swapping
            </Link>
            <a
              href="#how"
              className="px-8 py-3 border border-stone-800 hover:border-stone-600 text-stone-400 hover:text-stone-200 rounded-xl text-sm transition-colors"
            >
              See how it works
            </a>
          </div>

          {/* Example intent */}
          <div className="mt-4 inline-flex items-center gap-3 px-5 py-3 bg-stone-900/50 border border-stone-800/60 rounded-2xl">
            <span className="text-stone-700 text-xs">Try:</span>
            <span className="text-stone-400 text-sm font-light italic">
              &ldquo;When ETH drops to $3000, buy 0.5 ETH&rdquo;
            </span>
          </div>
        </div>

        {/* Scroll indicator */}
        <a
          href="#features"
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-stone-600 hover:text-stone-400 transition-colors group"
        >
          <span className="text-[10px] tracking-widest uppercase">Explore</span>
          <div className="flex flex-col items-center gap-0.5 animate-bounce">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </a>
      </section>

      {/* Stats */}
      <section className="px-6 md:px-12 py-16 border-y border-stone-900">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center space-y-1">
              <p className="text-2xl md:text-3xl font-light text-stone-200">{s.value}</p>
              <p className="text-stone-600 text-xs tracking-widest uppercase">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 md:px-12 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <p className="text-stone-600 text-[10px] tracking-[0.3em] uppercase">Capabilities</p>
            <h2 className="text-2xl md:text-3xl font-light text-stone-200">Everything you need. Nothing you don&apos;t.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-6 py-5 space-y-3 hover:border-stone-700 transition-colors group">
                <span className="text-2xl text-stone-600 group-hover:text-gold-400/60 transition-colors">{f.icon}</span>
                <p className="text-stone-200 text-sm font-medium">{f.title}</p>
                <p className="text-stone-600 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-6 md:px-12 py-24 border-t border-stone-900">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <p className="text-stone-600 text-[10px] tracking-[0.3em] uppercase">How it works</p>
            <h2 className="text-2xl md:text-3xl font-light text-stone-200">Three steps. That&apos;s genuinely it.</h2>
          </div>
          <div className="space-y-px">
            {STEPS.map((s, i) => (
              <div key={s.num} className={`flex gap-8 px-6 py-6 ${i < STEPS.length - 1 ? "border-b border-stone-900" : ""}`}>
                <span className="text-gold-500/50 text-sm font-mono mt-0.5 shrink-0 w-6">{s.num}</span>
                <div className="space-y-1.5">
                  <p className="text-stone-200 text-sm font-medium">{s.title}</p>
                  <p className="text-stone-600 text-xs leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-12 py-24 border-t border-stone-900">
        <div className="max-w-xl mx-auto text-center space-y-8">
          <div className="w-16 h-16 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
            <span className="text-gold-400/60 text-2xl">⬡</span>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-light text-stone-200">Ready to swap with intention?</h2>
            <p className="text-stone-600 text-sm">Connect your wallet. No sign-up. No email. No friction.</p>
          </div>
          <Link
            href="/"
            className="inline-block px-10 py-3.5 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-gold-500/20"
          >
            Launch Intent Swap
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-12 py-8 border-t border-stone-900 flex items-center justify-between">
        <span className="text-stone-700 text-xs">⬡ Intent Swap · Open source · No protocol fee</span>
        <div className="flex items-center gap-6">
          <a href="https://github.com/Lovelle-Zhang/intent-swap" target="_blank" rel="noopener" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
            GitHub
          </a>
          <Link href="/docs" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">
            Docs
          </Link>
        </div>
      </footer>

    </main>
  );
}
