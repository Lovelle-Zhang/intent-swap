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
              in-app browser (MetaMask App → Browser tab → paste the URL).
            </p>
            <p className="text-stone-600">
              Scanning the WalletConnect QR depends on a relay that&apos;s unreliable on some
              networks (e.g. mainland China).
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="text-stone-300">💻 Most reliable:</span> install the MetaMask
              (or OKX / Rabby) browser extension and unlock it before clicking Connect — it
              appears in the wallet list as a direct option, no QR needed.
            </p>
            <p className="text-stone-600">
              The QR-scan fallback goes through a relay server that&apos;s unreliable on some
              networks (e.g. mainland China).
            </p>
          </>
        )}
      </div>
    </details>
  );
}
