"use client";

import { useEffect, useState } from "react";

/**
 * Tiny "Trouble connecting?" disclosure shown near every Connect call site.
 * The reliable path differs by device:
 *  - Mobile: open the site inside the wallet's in-app browser (injected provider).
 *  - Desktop: install + unlock the wallet's browser extension.
 * QR-scan via WalletConnect is the fallback path, but the WalletConnect
 * relay is unreliable on some networks (notably mainland China — FCM /
 * Google services are blocked).
 */
export function WalletConnectHelp() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMobile(/Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    }
  }, []);

  return (
    <details className="text-[11px] mt-2">
      <summary className="cursor-pointer text-stone-600 hover:text-stone-400 select-none">
        Trouble connecting? <span className="text-stone-700">▾</span>
      </summary>
      <div className="mt-2 space-y-1.5 text-stone-500 leading-relaxed pl-1">
        {isMobile ? (
          <>
            <p>
              <span className="text-stone-300">📱 Most reliable:</span> open{" "}
              <code className="text-stone-400">intent-swap.app</code> inside your wallet&apos;s
              in-app browser. Tap <span className="text-stone-300">OKX / Bitget / MetaMask</span>{" "}
              app → <span className="text-stone-300">Discover / Browser</span> tab → paste the URL.
            </p>
            <p className="text-stone-600">
              The QR-scan path uses WalletConnect&apos;s relay, which is intermittently blocked
              on mainland-China networks. In-app browser bypasses it entirely.
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="text-stone-300">💻 Most reliable:</span> install a wallet
              browser extension and unlock it before clicking Connect:{" "}
              <a href="https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-gold-400 underline">OKX</a>
              {" · "}
              <a href="https://chromewebstore.google.com/detail/bitget-wallet/jiidiaalihmmhddjgbnbgdfflelocpak" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-gold-400 underline">Bitget</a>
              {" · "}
              <a href="https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn" target="_blank" rel="noopener noreferrer" className="text-stone-300 hover:text-gold-400 underline">MetaMask</a>
              . Refresh after installing — the wallet then appears as a direct option, no QR needed.
            </p>
            <p className="text-stone-600">
              The QR-scan fallback uses WalletConnect&apos;s relay, which is intermittently
              blocked on mainland-China networks. A locally-installed extension avoids the
              relay entirely.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
