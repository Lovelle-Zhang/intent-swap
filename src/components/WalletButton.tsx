"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-4 py-1.5 text-xs border border-stone-700 text-stone-300 rounded-xl hover:border-stone-500 hover:text-stone-100 transition-all duration-200 bg-stone-900/60"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="px-4 py-1.5 text-xs border border-gold-500/40 text-gold-400 rounded-xl hover:border-gold-500/70 hover:text-gold-300 transition-all duration-200 bg-stone-900/60 disabled:opacity-50"
    >
      {isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
