import type { TrustEvidenceItem } from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";

const STATE_SYMBOL: Readonly<Record<TrustEvidenceItem["state"], string>> = {
  Present: "✓",
  "Not applicable": "—",
  Missing: "!",
};

export function TrustEvidenceSummary({ items }: { readonly items: readonly TrustEvidenceItem[] }) {
  return (
    <aside className={styles.authorityRail} aria-labelledby="authority-title">
      <div className={styles.authorityHeading}>
        <p className={styles.eyebrow}>INDEPENDENT RECORDS</p>
        <h2 id="authority-title">Authority / Evidence</h2>
        <span>Independent records</span>
      </div>
      <div className={styles.authorityList}>
        {items.map((item) => (
          <article data-evidence-state={item.state.toLowerCase().replace(" ", "-")} key={item.label}>
            <span aria-hidden="true">{STATE_SYMBOL[item.state]}</span>
            <div><small>{item.label}</small><strong>{item.state}</strong><p>{item.detail}</p></div>
          </article>
        ))}
      </div>
    </aside>
  );
}
