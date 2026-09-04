import Link from "next/link";
import type { ReactNode } from "react";
import "./legal.css";

function Logo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x=".75" y=".75" width="38.5" height="38.5" rx="11" fill="var(--surface-2)" stroke="var(--line)" />
      <path d="M17.5 12.5 H13 V27.5 H17.5" fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 12.5 H27 V27.5 H22.5" fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3.1" fill="var(--sandbox)" />
    </svg>
  );
}

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="zf-legal">
      <header className="bar">
        <div className="bar-in">
          <Link className="brand" href="/"><Logo /> ZenFix <b>PayRun</b></Link>
          <span className="sandbox-tag">Sandbox · No real funds</span>
        </div>
      </header>
      <main className="wrap">{children}</main>
      <div className="foot">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/zenfix/sign-in">Sign in &rarr;</Link>
      </div>
    </div>
  );
}
