"use client";

import Link from "next/link";

const EXAMPLES = [
  { text: "swap 0.1 ETH to USDC", desc: "指定数量兑换" },
  { text: "convert 50% of my USDC to DAI", desc: "按比例兑换" },
  { text: "swap all my WBTC to ETH", desc: "全仓兑换" },
  { text: "buy ETH when price drops below 2000", desc: "条件单：价格触底买入" },
  { text: "sell USDC if ETH rises above 4000", desc: "条件单：价格触顶卖出" },
];

const TOKENS = [
  { symbol: "ETH", name: "Ethereum", icon: "Ξ" },
  { symbol: "USDC", name: "USD Coin", icon: "$" },
  { symbol: "USDT", name: "Tether", icon: "₮" },
  { symbol: "DAI", name: "Dai Stablecoin", icon: "◈" },
  { symbol: "WBTC", name: "Wrapped Bitcoin", icon: "₿" },
  { symbol: "WETH", name: "Wrapped Ether", icon: "Ξ" },
];

const SLIPPAGE = [
  { label: "0.5%", level: "low", desc: "适合稳定币对，价格影响极小" },
  { label: "1%", level: "normal", desc: "默认设置，适合大多数交易" },
  { label: "3%", level: "high", desc: "适合波动较大的代币或大额交易" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-stone-200 text-base font-medium tracking-wide border-b border-stone-800 pb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:py-12">
      <div className="max-w-2xl mx-auto space-y-10">

        {/* 返回 */}
        <Link href="/" className="inline-flex items-center gap-2 text-stone-600 hover:text-stone-400 text-sm transition-colors">
          ← Back
        </Link>

        {/* 标题 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded border border-gold-500/20 flex items-center justify-center">
              <span className="text-gold-500/80 text-xs">⬡</span>
            </div>
            <span className="text-stone-500 text-xs tracking-widest uppercase">Docs</span>
          </div>
          <h1 className="text-stone-100 text-2xl font-light tracking-tight">
            Intent Swap
          </h1>
          <p className="text-stone-500 text-sm leading-relaxed">
            用自然语言描述你的交易意图，我们找到最优路由并执行。
          </p>
        </div>

        {/* 如何使用 */}
        <Section title="如何使用">
          <p className="text-stone-500 text-sm leading-relaxed">
            在首页输入框中，用英文描述你想做的交易。支持立即执行和条件单两种模式。
          </p>
          <div className="space-y-2">
            {EXAMPLES.map((ex, i) => (
              <div key={i} className="flex items-start gap-3 bg-stone-900/40 border border-stone-800/60 rounded-xl px-4 py-3">
                <code className="text-gold-400/80 text-xs flex-1 font-mono leading-relaxed">
                  "{ex.text}"
                </code>
                <span className="text-stone-600 text-xs shrink-0 pt-0.5">{ex.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* 支持的代币 */}
        <Section title="支持的代币">
          <p className="text-stone-500 text-sm">当前支持以下代币（Ethereum Mainnet）：</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {TOKENS.map((t) => (
              <div key={t.symbol} className="flex items-center gap-3 bg-stone-900/40 border border-stone-800/60 rounded-xl px-4 py-3">
                <span className="text-lg w-6 text-center">{t.icon}</span>
                <div>
                  <p className="text-stone-200 text-sm font-medium">{t.symbol}</p>
                  <p className="text-stone-600 text-xs">{t.name}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 条件单 */}
        <Section title="条件单">
          <p className="text-stone-500 text-sm leading-relaxed">
            条件单允许你设置价格触发条件，当市场价格达到目标时自动提醒。
          </p>
          <div className="space-y-3">
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl p-4 space-y-2">
              <p className="text-stone-300 text-sm font-medium">触发条件</p>
              <p className="text-stone-500 text-xs leading-relaxed">
                支持 <span className="text-stone-300">above（价格高于）</span> 和 <span className="text-stone-300">below（价格低于）</span> 两种触发方式。
              </p>
            </div>
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl p-4 space-y-2">
              <p className="text-stone-300 text-sm font-medium">邮件提醒</p>
              <p className="text-stone-500 text-xs leading-relaxed">
                填写邮箱后，当价格触达目标时我们会发送邮件通知。条件单本身不会自动执行链上交易，需要手动确认。
              </p>
            </div>
          </div>
        </Section>

        {/* 滑点 */}
        <Section title="滑点设置">
          <p className="text-stone-500 text-sm leading-relaxed">
            滑点是指实际成交价格与预期价格的最大允许偏差。
          </p>
          <div className="space-y-2">
            {SLIPPAGE.map((s) => (
              <div key={s.level} className="flex items-center justify-between bg-stone-900/40 border border-stone-800/60 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-gold-400/70 text-sm font-mono w-8">{s.label}</span>
                  <span className="text-stone-500 text-xs">{s.desc}</span>
                </div>
                {s.level === "normal" && (
                  <span className="text-stone-600 text-xs border border-stone-800 rounded-md px-2 py-0.5">默认</span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 路由 & 费用 */}
        <Section title="路由 & 费用">
          <div className="space-y-2">
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl p-4 space-y-2">
              <p className="text-stone-300 text-sm font-medium">交易路由</p>
              <p className="text-stone-500 text-xs leading-relaxed">
                所有交易通过 <span className="text-stone-300">Uniswap V3</span> 路由执行，自动寻找最优流动性池。
              </p>
            </div>
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl p-4 space-y-2">
              <p className="text-stone-300 text-sm font-medium">Gas 费</p>
              <p className="text-stone-500 text-xs leading-relaxed">
                交易需要支付 Ethereum 网络 Gas 费，费用由网络拥堵程度决定。预览页面会显示预估 Gas 费用。
              </p>
            </div>
          </div>
        </Section>

        {/* 安全 */}
        <Section title="安全说明">
          <div className="space-y-2">
            {[
              { icon: "🔐", title: "非托管", desc: "我们不持有你的资产。所有交易直接在你的钱包和智能合约之间进行。" },
              { icon: "🔗", title: "链上执行", desc: "每笔交易都在 Ethereum 区块链上执行，完全透明可查。" },
              { icon: "👁", title: "预览确认", desc: "每笔交易在执行前都需要在预览页面确认，你始终保持控制权。" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 bg-stone-900/40 border border-stone-800/60 rounded-xl px-4 py-3">
                <span className="text-lg mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-stone-300 text-sm font-medium">{item.title}</p>
                  <p className="text-stone-500 text-xs leading-relaxed mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 底部 */}
        <div className="pt-4 border-t border-stone-800/50 text-center">
          <p className="text-stone-700 text-xs">
            更多内容持续完善中 · Intent Swap
          </p>
        </div>

      </div>
    </main>
  );
}
