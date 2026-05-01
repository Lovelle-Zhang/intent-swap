"use client";

import { useState } from "react";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { IntentInput } from "@/components/IntentInput";

export default function Home() {
  const [mode, setMode] = useState<"swap" | "conditional">("swap");
  const [menuOpen, setMenuOpen] = useState(false);

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
      <header className="relative z-10 flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 md:py-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-gold-500/30 flex items-center justify-center">
            <span className="text-gold-500 text-xs">⬡</span>
          </div>
          <span className="text-stone-400 text-xs tracking-[0.15em] uppercase font-light">
            Intent Swap
          </span>
        </div>

        {/* 右侧导航 */}
        <div className="flex items-center gap-3">
          {/* 桌面端：显示所有链接 */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/history" className="text-stone-500 hover:text-stone-300 text-xs tracking-wide transition-colors">
              History
            </Link>
            <Link href="/orders" className="text-stone-500 hover:text-stone-300 text-xs tracking-wide transition-colors">
              Orders
            </Link>
          </div>
          
          {/* 桌面端：钱包按钮 */}
          <div className="hidden md:block">
            <WalletButton />
          </div>

          {/* 移动端：汉堡菜单 */}
          <div className="md:hidden relative">
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-stone-600 hover:text-stone-400 text-xs p-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {/* 下拉菜单 */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 bg-stone-900 border border-stone-800 rounded-lg shadow-xl min-w-[160px] py-2 z-50">
                <Link 
                  href="/history" 
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 text-xs transition-colors"
                >
                  History
                </Link>
                <Link 
                  href="/orders" 
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800 text-xs transition-colors"
                >
                  Orders
                </Link>
                <div className="border-t border-stone-800 my-2" />
                <div className="px-4 py-2">
                  <WalletButton />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主体 */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-xl animate-fade-in">

          {/* 标题区 */}
          <div className="text-center mb-8 md:mb-10">
            {/* 装饰线 */}
            <div className="flex items-center justify-center gap-3 mb-6 md:mb-7">
              <div className="h-px w-12 md:w-20 bg-gradient-to-r from-transparent to-stone-700" />
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase font-light">Arbitrum · Uniswap V3</span>
              <div className="h-px w-12 md:w-20 bg-gradient-to-l from-transparent to-stone-700" />
            </div>

            <h1 className="text-stone-100 text-2xl md:text-[2.5rem] font-light tracking-tight leading-tight mb-3 md:mb-4 px-4">
              Where should your<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-stone-400">
                wealth flow?
              </span>
            </h1>
            <p className="text-stone-500 text-xs md:text-[13px] leading-relaxed max-w-md mx-auto px-4">
              Describe your intent in plain language.<br />
              We find the best route and execute it.
            </p>
          </div>

          {/* Tab 切换 */}
          <div className="flex items-center justify-center gap-2 mb-6 px-4">
            <button
              onClick={() => setMode("swap")}
              className={`flex-1 md:flex-none md:min-w-[140px] py-2.5 rounded-lg text-xs tracking-wide transition-all duration-200 ${
                mode === "swap"
                  ? "bg-stone-800 text-stone-200 border border-stone-700"
                  : "text-stone-500 hover:text-stone-300 border border-transparent"
              }`}
            >
              Instant Swap
            </button>
            <button
              onClick={() => setMode("conditional")}
              className={`flex-1 md:flex-none md:min-w-[140px] py-2.5 rounded-lg text-xs tracking-wide transition-all duration-200 ${
                mode === "conditional"
                  ? "bg-stone-800 text-stone-200 border border-stone-700"
                  : "text-stone-500 hover:text-stone-300 border border-transparent"
              }`}
            >
              Conditional Order
            </button>
          </div>

          {/* 输入区 */}
          <IntentInput mode={mode} />

          {/* 底部特性 */}
          <div className="mt-8 md:mt-10 hidden md:flex items-center justify-center gap-6">
            {[
              { label: "Non-custodial" },
              { label: "·" },
              { label: "Best route" },
              { label: "·" },
              { label: "~1s finality" },
            ].map((f, i) => (
              <span key={i} className="text-stone-600 text-[11px] tracking-wider font-light">
                {f.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 底部细线 */}
      <div className="relative z-10 h-px bg-gradient-to-r from-transparent via-stone-800 to-transparent mx-6 md:mx-8" />
      <footer className="relative z-10 text-center py-3 md:py-4 text-stone-700 text-[10px] tracking-[0.2em] font-light">
        INTENT.SWAP
      </footer>
    </main>
  );
}
