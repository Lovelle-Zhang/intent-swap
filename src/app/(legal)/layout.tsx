import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-semibold tracking-[0.18em] text-amber-400">SANDBOX / NO REAL FUNDS</p>
      <div className="mt-8 space-y-6 leading-relaxed text-stone-300">{children}</div>
      <nav className="mt-14 flex gap-6 border-t border-stone-800 pt-6 text-sm text-cyan-300">
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/zenfix/sign-in" className="hover:underline">Sign in &rarr;</Link>
      </nav>
    </main>
  );
}
