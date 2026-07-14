import Link from "next/link";

import { Identifier } from "@/components/zenfix/identifier";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { CommandCenterAttention } from "@/features/payrun/presentation/pilot-session";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";

import styles from "./command-center.module.css";

export function DecisionQueue({ attention }: { readonly attention: CommandCenterAttention }) {
  const { scenario } = attention;
  return (
    <section className={`${styles.panel} ${styles.decisionQueue}`} aria-labelledby="decision-queue-title">
      <div className={styles.panelHeading}>
        <div><p className={styles.eyebrow}>ATTENTION FIRST</p><h2 id="decision-queue-title">Decision Queue</h2></div>
        <StatusBadge status={attention.decision} />
      </div>
      <div className={styles.queueBody}>
        <div className={styles.queueDecision}>
          <p>{attention.hasException ? "Action requires attention" : "No current exception"}</p>
          <strong>{attention.stageState}</strong>
          <span>{attention.hasException ? `Stopped at ${attention.stageLabel}` : `Completed through ${attention.stageLabel}`}</span>
        </div>
        <dl className={styles.queueFacts}>
          <div><dt>Agent</dt><dd><Identifier value={scenario.agent.id} /></dd></div>
          <div><dt>Purpose</dt><dd>{scenario.purpose}</dd></div>
          <div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div>
          <div><dt>Amount</dt><dd>{formatAtomicMoney(scenario.amount)}</dd></div>
        </dl>
        <div className={styles.queueReason}>
          <span>Authoritative reason</span>
          <strong>{attention.reason}</strong>
          <Link href={`/payruns/${encodeURIComponent(scenario.payRunId)}`}>Inspect focused PayRun <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </section>
  );
}
