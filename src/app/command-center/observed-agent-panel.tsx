import { Identifier } from "@/components/zenfix/identifier";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import type { ObservedAgentSummary } from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";

function utcDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
}

export function ObservedAgentPanel({ agents }: { readonly agents: readonly ObservedAgentSummary[] }) {
  return (
    <section className={`${styles.panel} ${styles.agentPanel}`} aria-labelledby="observed-agent-title">
      <div className={styles.panelHeading}>
        <div><p className={styles.eyebrow}>AGENT-FIRST OPERATIONS</p><h2 id="observed-agent-title">Observed Agent</h2></div>
        <p>Observed in current pilot session</p>
      </div>
      <div className={styles.agentList}>
        {agents.map((agent) => (
          <article key={agent.agentId}>
            <div className={styles.agentIdentity}>
              <span className={styles.agentGlyph} aria-hidden="true">A</span>
              <div><strong>{agent.agentName ?? "Observed sandbox agent"}</strong><Identifier value={agent.agentId} /></div>
              <span className={styles.agentAttention}>{agent.attentionState}</span>
            </div>
            <div className={styles.agentNumbers}>
              <div><span>Pay Runs</span><strong>{agent.observedPayRuns}</strong></div>
              <div><span>Decisions</span><strong>{agent.completed} completed · {agent.needsReview} review · {agent.blocked} blocked</strong></div>
              <div><span>Controlled spend</span><strong>{formatAtomicMoney(agent.controlledSpend)}</strong></div>
              <div><span>Latest activity</span><strong>{utcDate(agent.latestActivityAt)} UTC</strong></div>
            </div>
            <dl className={styles.agentMetadata}>
              <div><dt>Known purpose</dt><dd>{agent.purposes.join(" · ")}</dd></div>
              <div><dt>Policy binding</dt><dd>{agent.policyBindings.join(" · ")}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <p className={styles.unavailableNote}>Additional agent profile fields are not available in current pilot data.</p>
    </section>
  );
}
