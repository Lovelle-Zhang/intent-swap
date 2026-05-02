"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { WalletButton } from "@/components/WalletButton";
import { IntentInput } from "@/components/IntentInput";

export default function Home() {
  const [mode, setMode] = useState<"swap" | "conditional">("swap");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外部关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);  // Force recompile

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
      <header className="relative z-10 flex items-center justify-between px-6 md:px-8 py-4 md:py-5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded border border-gold-500/20 flex items-center justify-center">
            <span className="text-gold-500/80 text-sm">⬡</span>
          </div>
          <span className="text-stone-300 text-sm tracking-[0.12em] font-light">
            Intent Swap
          </span>
        </div>

        {/* 右侧：钱包 + 菜单 */}
        <div className="flex items-center gap-3">
          {/* 钱包按钮（始终显示） */}
          <WalletButton />

          {/* 菜单按钮 */}
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 rounded-lg border border-stone-800 hover:border-stone-700 flex items-center justify-center text-stone-500 hover:text-stone-300 transition-colors"
              aria-label="Menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* 下拉菜单：不使用 fixed 遮罩，改用 document 事件监听 */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl min-w-[180px] py-2 animate-fade-in" style={{zIndex: 9999}}>
                <Link 
                  href="/history" 
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 text-sm transition-colors"
                >
                  <span className="text-stone-600">📜</span>
                  <span>History</span>
                </Link>
                <Link 
                  href="/orders" 
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 text-sm transition-colors"
                >
                  <span className="text-stone-600">⏰</span>
                  <span>Orders</span>
                </Link>
                <div className="h-px bg-stone-800/60 my-2 mx-3" />
                <Link 
                  href="/docs" 
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-stone-500 hover:text-stone-300 hover:bg-stone-800/50 text-xs transition-colors"
                >
                  <span className="text-stone-700">📖</span>
                  <span>Docs</span>
                </Link>
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
