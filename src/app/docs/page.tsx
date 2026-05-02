"use client";

import Link from "next/link";

const EXAMPLES = [
  { text: "swap 0.1 ETH to USDC", tag: "exact amount" },
  { text: "convert 50% of my USDC to DAI", tag: "percentage" },
  { text: "swap all my WBTC to ETH", tag: "max balance" },
  { text: "buy ETH when price drops below 2000", tag: "conditional" },
  { text: "sell USDC if ETH rises above 4000", tag: "conditional" },
];

const TOKENS = [
  { symbol: "ETH",  icon: "Ξ", name: "Ethereum" },
  { symbol: "USDC", icon: "$", name: "USD Coin" },
  { symbol: "USDT", icon: "₮", name: "Tether" },
  { symbol: "DAI",  icon: "◈", name: "Dai" },
  { symbol: "WBTC", icon: "₿", name: "Wrapped Bitcoin" },
  { symbol: "WETH", icon: "Ξ", name: "Wrapped Ether" },
];

const SLIPPAGE = [
  { value: "0.5%", key: "low",    desc: "Stablecoin pairs or low-volatility swaps." },
  { value: "1%",   key: "normal", desc: "Default. Suitable for most trades.", isDefault: true },
  { value: "3%",   key: "high",   desc: "High-volatility tokens or large amounts." },
];

const ROUTING = [
  { label: "Router",       value: "Uniswap V3" },
  { label: "Route type",   value: "Single-hop & Multi-hop" },
  { label: "Networks",     value: "Ethereum · Arbitrum · Linea" },
  { label: "Gas",          value: "Estimated before confirmation" },
  { label: "Protocol fee", value: "None" },
];

const SECURITY = [
  { title: "Non-custodial",         desc: "We never hold your assets. All swaps happen directly between your wallet and the smart contract." },
  { title: "On-chain execution",    desc: "Every transaction is executed on Ethereum and is fully transparent on-chain." },
  { title: "Preview before swap",   desc: "Every trade requires explicit confirmation. You stay in full control at all times." },
  { title: "MEV Protection",        desc: "Transactions routed through Flashbots Protect on Mainnet by default, shielding you from sandwich attacks." },
  { title: "Price impact warning",  desc: "Amber warning above 1% impact, red alert above 5%. Powered by DeFiLlama price feeds." },
];

const CONTRACT_INFO = [
  { label: "Contract",   value: "ConditionalSwapVault" },
  { label: "Network",    value: "Ethereum Mainnet" },
  { label: "Address",    value: "0x52a8fe40...dec0ee", href: "https://etherscan.io/address/0x52a8fe40324621d310ede9bfd20396b82dfec0ee#code" },
  { label: "Verified",   value: "Sourcify (perfect) ↗", href: "https://sourcify.dev/#/lookup/0x52a8fe40324621d310ede9bfd20396b82dfec0ee" },
  { label: "Standard",   value: "EIP-712 signed orders" },
  { label: "Auth",       value: "Keeper-based execution" },
];

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-stone-800 to-transparent" />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-stone-500 text-[10px] tracking-[0.3em] uppercase font-light mb-5">
      {children}
    </h2>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen px-5 py-8 md:py-14">
      <div className="max-w-xl mx-auto space-y-12">

        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-stone-700 hover:text-stone-500 text-xs tracking-wide transition-colors"
        >
          ← Back
        </Link>

        {/* Hero */}
        <div className="space-y-3 pb-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 rounded border border-gold-500/20 flex items-center justify-center">
              <span className="text-gold-500/70 text-[10px]">⬡</span>
            </div>
            <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Docs</span>
          </div>
          <h1 className="text-stone-100 text-2xl font-light tracking-tight">
            Intent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-stone-400">
              Swap
            </span>
          </h1>
          <p className="text-stone-500 text-sm leading-relaxed max-w-sm">
            Describe what you want in plain language.
            We find the optimal route and execute the swap.
          </p>
        </div>

        <Divider />

        {/* How it works */}
        <section className="space-y-5">
          <SectionTitle>How it works</SectionTitle>
          <p className="text-stone-500 text-sm leading-relaxed">
            Type your intent in the input field. The AI parses it, previews the trade,
            and waits for your{" "}
            <span className="text-stone-300">confirmation</span>{" "}
            before executing.
          </p>
          <div className="space-y-2">
            {EXAMPLES.map((ex, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 px-4 py-3 bg-stone-900/30 border border-stone-800/50 rounded-xl"
              >
                <code className="text-gold-400/80 text-xs font-mono flex-1 leading-relaxed">
                  "{ex.text}"
                </code>
                <span className="text-stone-700 text-[10px] tracking-wide shrink-0 border border-stone-800 rounded-md px-2 py-0.5">
                  {ex.tag}
                </span>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Supported tokens */}
        <section className="space-y-5">
          <SectionTitle>Supported tokens</SectionTitle>
          <p className="text-stone-500 text-sm leading-relaxed">
            Search from <span className="text-stone-300">1,700+</span> tokens via the Uniswap
            official token list. Common tokens are shown by default.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TOKENS.map((t) => (
              <div
                key={t.symbol}
                className="flex items-center gap-3 px-4 py-3 bg-stone-900/30 border border-stone-800/50 rounded-xl"
              >
                <span className="text-base w-5 text-center text-gold-500/50">{t.icon}</span>
                <div>
                  <p className="text-gold-400/70 text-xs font-medium">{t.symbol}</p>
                  <p className="text-stone-600 text-[11px]">{t.name}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Conditional orders */}
        <section className="space-y-5">
          <SectionTitle>Conditional orders</SectionTitle>
          <p className="text-stone-500 text-sm leading-relaxed">
            Set a price trigger. When the condition is met, the{" "}
            <span className="text-stone-300">on-chain vault</span>{" "}
            auto-executes the swap via a keeper — no manual action needed.
            Your funds are held in the{" "}
            <span className="text-stone-300">ConditionalSwapVault</span>{" "}
            contract and can be withdrawn at any time.
          </p>
          <div className="space-y-2">
            {[
              { label: "Trigger types",  value: "Price above · Price below" },
              { label: "Execution",      value: "On-chain auto-execution (keeper)" },
              { label: "Custody",        value: "Vault contract — withdraw anytime" },
              { label: "Signature",      value: "EIP-712 typed data (off-chain)" },
              { label: "Notification",   value: "Email alert on execution" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 bg-stone-900/30 border border-stone-800/50 rounded-xl">
                <span className="text-stone-600 text-xs">{row.label}</span>
                <span className="text-stone-300 text-xs">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Contract */}
        <section className="space-y-5">
          <SectionTitle>Smart contract</SectionTitle>
          <div className="space-y-2">
            {CONTRACT_INFO.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 bg-stone-900/30 border border-stone-800/50 rounded-xl">
                <span className="text-stone-600 text-xs">{row.label}</span>
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-400/70 text-xs font-mono hover:text-gold-400 transition-colors"
                  >
                    {row.value} ↗
                  </a>
                ) : (
                  <span className="text-stone-300 text-xs">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Slippage */}
        <section className="space-y-5">
          <SectionTitle>Slippage tolerance</SectionTitle>
          <p className="text-stone-500 text-sm leading-relaxed">
            Maximum allowed deviation between the quoted and executed price.
          </p>
          <div className="space-y-2">
            {SLIPPAGE.map((s) => (
              <div
                key={s.key}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${
                  s.isDefault
                    ? "bg-gold-500/5 border-gold-500/20"
                    : "bg-stone-900/30 border-stone-800/50"
                }`}
              >
                <span className={`text-xs font-mono w-8 shrink-0 ${s.isDefault ? "text-gold-400" : "text-stone-400"}`}>
                  {s.value}
                </span>
                <span className="text-stone-500 text-xs flex-1">{s.desc}</span>
                {s.isDefault && (
                  <span className="text-gold-600 text-[10px] border border-gold-800/40 rounded-md px-2 py-0.5 shrink-0">
                    default
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Routing & fees */}
        <section className="space-y-5">
          <SectionTitle>Routing & fees</SectionTitle>
          <p className="text-stone-500 text-sm leading-relaxed">
            Automatically picks the best route — single-hop for direct pairs,
            multi-hop via WETH / USDC / USDT / DAI for better rates.
          </p>
          <div className="space-y-2">
            {ROUTING.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3 bg-stone-900/30 border border-stone-800/50 rounded-xl">
                <span className="text-stone-600 text-xs">{row.label}</span>
                <span className="text-stone-300 text-xs">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* Security */}
        <section className="space-y-5">
          <SectionTitle>Security</SectionTitle>
          <div className="space-y-2">
            {SECURITY.map((item) => (
              <div key={item.title} className="px-4 py-4 bg-stone-900/30 border border-stone-800/50 rounded-xl space-y-1.5">
                <p className="text-gold-400/60 text-xs font-medium tracking-wide">{item.title}</p>
                <p className="text-stone-500 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="pt-2 pb-10">
          <div className="h-px bg-gradient-to-r from-transparent via-stone-800 to-transparent mb-6" />
          <p className="text-center text-stone-800 text-[10px] tracking-[0.25em] uppercase">
            Intent Swap · Documentation
          </p>
        </div>

      </div>
    </main>
  );
}
