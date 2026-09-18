"use client";

import { usePathname } from "next/navigation";

// A slim test-mode disclaimer on the ZenFix React pages. The root "/" is the
// marketing landing, which frames its own test-mode status, so the banner would
// only duplicate it there — show nothing on root, the banner everywhere else.
export function EnvironmentBanner() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/") return null;

  return (
    <div className="relative z-[60] text-center py-1.5 text-[11px] tracking-[0.15em] bg-amber-950/40 border-b border-amber-800/40 text-amber-400/90">
      TEST MODE · BASE SEPOLIA · NO MAINNET FUNDS
    </div>
  );
}
