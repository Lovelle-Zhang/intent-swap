import Link from "next/link";

import { Identifier } from "@/components/zenfix/identifier";
import { StatusBadge } from "@/components/zenfix/status-badge";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import type { CommandCenterAttention } from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";

export function DecisionQueue({ attention }: { readonly attention: CommandCenterAttention }) {
  const { scenario } = attention;

  return (
    <article className={styles.decisionFocus}>
      <div className={styles.agentIdentity}>
        <span className={styles.agentOrb} aria-hidden="true">A</span>
        <div>
          <span>Observed Agent</span>
          <strong><Identifier value={scenario.agent.id} /></strong>
          <small>Observed in current pilot session</small>
        </div>
      </div>
      <div className={styles.decisionCore}>
        <span>Policy decision</span>
        <h2>{attention.hasException ? "Decision requires attention" : "Decision path completed"}</h2>
        <div className={styles.decisionState}>
          <StatusBadge status={attention.decision} />
          <strong>{attention.stageState}</strong>
        </div>
        <p>{attention.reason}</p>
      </div>
      <dl className={styles.decisionFacts}>
        <div><dt>Purpose</dt><dd>{scenario.purpose}</dd></div>
        <div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div>
        <div><dt>Amount</dt><dd>{formatAtomicMoney(scenario.amount)}</dd></div>
      </dl>
      <div className={styles.stopBoundary}>
        <span aria-hidden="true" />
        <strong>{attention.hasException ? `Stopped at ${attention.stageLabel}` : `Completed through ${attention.stageLabel}`}</strong>
        <small>{attention.hasException ? "No downstream execution" : "Canonical lifecycle closed"}</small>
        <Link href={`/payruns/${encodeURIComponent(scenario.payRunId)}`}>Inspect focused PayRun <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
