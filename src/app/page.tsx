"use client";

import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { IntentInput } from "@/components/IntentInput";

export default function Home() {

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">

      {/* 背景层：多层光晕 */}
      <div className="fixed inset-0 pointer-events-none">
        {/* 中心暖光 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse,rgba(245,158,11,0.05)_0%,transparent_65%)]" />
        {/* 左下冷光 */}
        <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-[radial-gradient(ellipse,rgba(99,102,241,0.03)_0%,transparent_70%)]" />
        {/* 右上冷光 */}
        <div className="absolute top-0 right-0 w-[300px] h-[200px] bg-[radial-gradient(ellipse,rgba(168,162,158,0.03)_0%,transparent_70%)]" />
        {/* 细线网格 */}
        <div className="absolute inset-0 opacity-[0.015]"
          style={{backgroundImage: "linear-gradient(rgba(168,162,158,1) 1px,transparent 1px),linear-gradient(90deg,rgba(168,162,158,1) 1px,transparent 1px)", backgroundSize: "80px 80px"}} />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded border border-gold-500/30 flex items-center justify-center">
            <span className="text-gold-500 text-xs">⬡</span>
          </div>
          <span className="text-stone-400 text-sm tracking-widest uppercase font-light">
            Intent Swap
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/history" className="text-stone-600 hover:text-stone-400 text-xs transition-colors">History</Link>
          <WalletButton />
        </div>
      </header>

      {/* 主体 */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-xl animate-fade-in">

          {/* 标题区 */}
          <div className="text-center mb-12">
            {/* 装饰线 */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-stone-700" />
              <span className="text-stone-700 text-xs tracking-[0.3em] uppercase">Arbitrum · Uniswap V3</span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-stone-700" />
            </div>

            <h1 className="text-stone-100 text-3xl font-light tracking-tight leading-tight mb-4">
              Where should your<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-stone-400">
                wealth flow?
              </span>
            </h1>
            <p className="text-stone-600 text-sm leading-relaxed max-w-sm mx-auto">
              Describe your intent in plain language.<br />
              We find the best route and execute it.
            </p>
          </div>

          {/* 输入区 */}
          <IntentInput />

          {/* 底部特性 */}
          <div className="mt-12 flex items-center justify-center gap-8">
            {[
              { label: "Non-custodial" },
              { label: "·" },
              { label: "Best route" },
              { label: "·" },
              { label: "~1s finality" },
            ].map((f, i) => (
              <span key={i} className="text-stone-700 text-xs tracking-wider">
                {f.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 底部细线 */}
      <div className="relative z-10 h-px bg-gradient-to-r from-transparent via-stone-800 to-transparent mx-8" />
      <footer className="relative z-10 text-center py-4 text-stone-800 text-xs tracking-widest">
        INTENT.SWAP
      </footer>
    </main>
  );
}
