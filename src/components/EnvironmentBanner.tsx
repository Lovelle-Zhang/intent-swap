"use client";

import { usePathname } from "next/navigation";

// ZenFix (sandbox) surfaces vs. legacy Intent Swap (DEX) surfaces need DIFFERENT
// disclaimers. The legacy DEX connects to mainnet and moves real assets — labeling
// it "NO REAL FUNDS" would be a false and dangerous claim. Route prefix decides.
const ZENFIX_PREFIXES = ["/sandbox", "/command-center", "/payruns", "/pilot-validation", "/zenfix"] as const;

export function EnvironmentBanner() {
  const pathname = usePathname() ?? "/";

  // The root is the ZenFix PayRun marketing landing — it frames its own test-mode
  // status, so the legacy-DEX disclaimer here would only confuse. Show nothing.
  if (pathname === "/") return null;

  const isZenfix = ZENFIX_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isZenfix) {
    return (
      <div className="relative z-[60] text-center py-1.5 text-[11px] tracking-[0.15em] bg-amber-950/40 border-b border-amber-800/40 text-amber-400/90">
        TEST MODE · BASE SEPOLIA · NO MAINNET FUNDS
      </div>
    );
  }

  return (
    <div className="relative z-[60] text-center py-1.5 text-[11px] tracking-wide bg-amber-950/30 border-b border-amber-900/40 text-amber-300/80">
      Legacy Intent Swap (DEX) — connects to mainnet, involves real assets.{" "}
      <a href="/sandbox" className="text-amber-200 hover:text-amber-100 underline underline-offset-2 transition-colors">
        Current product: ZenFix PayRun →
      </a>
    </div>
  );
}
