import type { TrustEvidenceItem } from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";

const STATE_SYMBOL: Readonly<Record<TrustEvidenceItem["state"], string>> = {
  Present: "✓",
  "Not applicable": "—",
  Missing: "!",
};

export function TrustEvidenceSummary({ items }: { readonly items: readonly TrustEvidenceItem[] }) {
  return (
    <section className={`${styles.panel} ${styles.trustPanel}`} aria-labelledby="trust-title">
      <div className={styles.panelHeading}>
        <div><p className={styles.eyebrow}>INDEPENDENT AUTHORITIES</p><h2 id="trust-title">Trust &amp; Evidence</h2></div>
        <p>Independent, explicit evidence states from canonical records.</p>
      </div>
      <div className={styles.trustGrid}>
        {items.map((item) => (
          <article data-evidence-state={item.state.toLowerCase().replace(" ", "-")} key={item.label}>
            <span aria-hidden="true">{STATE_SYMBOL[item.state]}</span>
            <div><strong>{item.label}</strong><small>{item.state}</small></div>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
