import Link from "next/link";
import type { ReactNode } from "react";

import type { PilotSessionView } from "@/features/payrun/pilot/session-contracts";

import { Identifier } from "./identifier";
import styles from "./zenfix.module.css";

export function CommandShell({
  active,
  session,
  children,
}: {
  readonly active: "command-center" | "payruns" | "pilot-validation";
  readonly session: PilotSessionView;
  readonly children: ReactNode;
}) {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/command-center" aria-label="ZenFix Command Center">
          <span className={styles.brandMark}>Z</span>
          <span>ZenFix</span>
        </Link>
        <nav className={styles.navigation} aria-label="Primary navigation">
          <Link aria-current={active === "command-center" ? "page" : undefined} href="/command-center">Command Center</Link>
          <Link aria-current={active === "payruns" ? "page" : undefined} href="/payruns">Pay Runs</Link>
          <Link aria-current={active === "pilot-validation" ? "page" : undefined} href="/pilot-validation">Pilot Validation</Link>
        </nav>
        <div className={styles.sandboxStamp}>
          <span className={styles.liveDot} />
          <div><strong>SANDBOX</strong><small>NO REAL FUNDS</small></div>
        </div>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><span>Agent Payment Control Layer</span><strong>Read-only pilot</strong></div>
          <details className={styles.provenance}>
            <summary>Session provenance</summary>
            <dl>
              <div><dt>Session</dt><dd><Identifier value={session.sessionId} /></dd></div>
              <div><dt>Source commit</dt><dd><Identifier value={session.sourceCommit} /></dd></div>
              <div><dt>Store generation</dt><dd>{session.storeGeneration}</dd></div>
              <div><dt>Store checksum</dt><dd><Identifier value={session.storeEnvelopeChecksum} /></dd></div>
              <div><dt>Manifest checksum</dt><dd><Identifier value={session.manifestChecksum} /></dd></div>
            </dl>
          </details>
        </header>
        <div className={styles.content}>{children}</div>
      </section>
    </main>
  );
}
