"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: balance } = useBalance({
    address,
    chainId: mainnet.id,
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // 用 ConnectButton.Custom 获取 openChainModal / openConnectModal
  return (
    <ConnectButton.Custom>
      {({ chain, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) return null;

        if (!isConnected) {
          return (
            <button
              onClick={openConnectModal}
              className="w-7 h-7 rounded-full border border-stone-700 hover:border-stone-500 flex items-center justify-center transition-colors"
              title="Connect wallet"
            >
              <span className="w-2 h-2 rounded-full border border-stone-600" />
            </button>
          );
        }

        const initials = address ? address.slice(2, 4).toUpperCase() : "??";
        const chainName = chain?.name ?? "ETH";
        const isUnsupported = chain?.unsupported ?? false;

        return (
          <div className="flex items-center gap-2.5" ref={ref}>
            {/* 网络标识：可点击切链 */}
            <button
              onClick={openChainModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-stone-800/60 hover:border-stone-700 transition-colors"
              title="Switch network"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isUnsupported ? "bg-red-500/70" : "bg-emerald-500/60"}`} />
              <span className={`text-[10px] tracking-wider ${isUnsupported ? "text-red-500/70" : "text-stone-600"}`}>
                {isUnsupported ? "Wrong" : chainName.slice(0, 3).toUpperCase()}
              </span>
            </button>

            {/* 钱包头像 */}
            <div className="relative">
              <button
                onClick={() => setOpen(!open)}
                className="w-7 h-7 rounded-full bg-stone-800 border border-stone-700 hover:border-stone-500 flex items-center justify-center text-[10px] text-stone-400 font-mono transition-colors"
                title={address}
              >
                {initials}
              </button>

              {/* 账户详情下拉 */}
              {open && (
                <div
                  className="absolute right-0 top-full mt-2 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl w-52 py-3"
                  style={{ zIndex: 9999 }}
                >
                  {/* 地址 + 余额 */}
                  <div className="px-4 pb-3 border-b border-stone-800">
                    <p className="text-stone-600 text-[10px] uppercase tracking-widest mb-1">Wallet</p>
                    <p className="text-stone-300 text-xs font-mono">
                      {address?.slice(0, 6)}…{address?.slice(-4)}
                    </p>
                    {balance && (
                      <p className="text-stone-500 text-xs mt-1">
                        {Number(balance.formatted).toFixed(4)} {balance.symbol}
                      </p>
                    )}
                  </div>

                  {/* 导航链接 */}
                  <div className="pt-2">
                    <Link href="/history" onClick={() => setOpen(false)}
                      className="block px-4 py-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 text-sm transition-colors">
                      History
                    </Link>
                    <Link href="/orders" onClick={() => setOpen(false)}
                      className="block px-4 py-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 text-sm transition-colors">
                      Orders
                    </Link>
                    <Link href="/docs" onClick={() => setOpen(false)}
                      className="block px-4 py-2 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 text-sm transition-colors">
                      Docs
                    </Link>
                  </div>

                  {/* 断开连接 */}
                  <div className="pt-2 mt-1 border-t border-stone-800">
                    <button
                      onClick={() => { disconnect(); setOpen(false); }}
                      className="w-full text-left px-4 py-2 text-stone-600 hover:text-stone-400 hover:bg-stone-800/30 text-xs transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
