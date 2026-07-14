import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { PayRunLifecycle } from "@/components/zenfix/lifecycle";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import { getDecisionSummary, getPilotMetrics, getPolicyHealth, getPrimaryStatus, SCENARIO_LABELS } from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";

export function CommandCenterView({ session }: { readonly session: PilotSessionView }) {
  const metrics = getPilotMetrics(session);
  const policyHealth = getPolicyHealth(session);
  const selected = session.scenarios[0]!;
  const cards = [
    ["Total Pay Runs", metrics.total, "Frozen pilot records"],
    ["Completed", metrics.completed, "Controlled outcomes"],
    ["Needs Review", metrics.needsReview, "Awaiting a human"],
    ["Blocked", metrics.blocked, "Stopped by policy"],
    ["Controlled Spend", formatAtomicMoney(metrics.controlledSpend), "Completed sandbox only"],
  ] as const;

  return (
    <CommandShell active="command-center" session={session}>
      <div className={styles.hero}>
        <div><p>OVERVIEW</p><h1>Command Center</h1><span>Decisions, evidence, and control for agent economic actions.</span></div>
        <div className={styles.integrity}><span>● Integrity verified</span><small>Generation {session.storeGeneration}</small></div>
      </div>

      <section className={styles.metrics} aria-label="Pilot metrics">
        {cards.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}
      </section>

      <div className={styles.primaryGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p>CONTROLLED AGENT</p><h2>Agent overview</h2></div><span className={styles.active}>Active in sandbox</span></div>
          <div className={styles.agentIdentity}><div className={styles.agentGlyph}>A</div><div><strong>Not available in current pilot data</strong><span><Identifier value={selected.agent.id} /></span></div></div>
          <dl className={styles.agentFacts}>
            <div><dt>Human manager</dt><dd>Not available in current pilot data</dd></div>
            <div><dt>Current purpose</dt><dd>{selected.purpose}</dd></div>
            <div><dt>Capability</dt><dd>Not available in current pilot data</dd></div>
            <div><dt>Risk level</dt><dd>Not available in current pilot data</dd></div>
            <div><dt>PayRun count</dt><dd>{session.scenarios.filter((scenario) => scenario.agent.id === selected.agent.id).length}</dd></div>
            <div><dt>Policy status</dt><dd>{selected.policy.outcome}</dd></div>
            <div><dt>Environment</dt><dd>Sandbox only · no real funds</dd></div>
          </dl>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p>POLICY HEALTH</p><h2>Decision controls</h2></div><span className={styles.policyId}>v{selected.policy.policyVersion}</span></div>
          <div className={styles.policyNumbers}><div><strong>{policyHealth.passed}</strong><span>Passed checks</span></div><div><strong>{policyHealth.review}</strong><span>Review checks</span></div><div><strong>{policyHealth.blocked}</strong><span>Blocked checks</span></div></div>
          <div className={styles.evidenceRow}><div><span>Evidence coverage</span><small>Actual policy evidence checks</small></div><strong>{policyHealth.evidencePassed} / {policyHealth.evidenceTotal} checks</strong></div>
        </section>
      </div>

      <section className={`${styles.panel} ${styles.lifecyclePanel}`}>
        <div className={styles.panelHeader}><div><p>PAYRUN CONTROL FLOW</p><h2>{SCENARIO_LABELS[selected.name]} lifecycle</h2></div><StatusBadge status={getPrimaryStatus(selected)} /></div>
        <PayRunLifecycle scenario={selected} />
      </section>

      <section className={styles.recent}>
        <div className={styles.sectionTitle}><div><p>CANONICAL PILOT SESSION</p><h2>Recent PayRuns</h2></div><Link href="/payruns">View full ledger →</Link></div>
        <div className={styles.scenarioGrid}>{session.scenarios.map((scenario) => (
          <article className={styles.scenarioCard} key={scenario.payRunId}>
            <div className={styles.cardTop}><span>{SCENARIO_LABELS[scenario.name]}</span><StatusBadge status={getPrimaryStatus(scenario)} /></div>
            <h3>{formatAtomicMoney(scenario.amount)}</h3>
            <p>{getDecisionSummary(scenario)}</p>
            <dl><div><dt>Agent</dt><dd><Identifier value={scenario.agent.id} /></dd></div><div><dt>Purpose</dt><dd>{scenario.purpose}</dd></div><div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div><div><dt>Funding</dt><dd>{scenario.funding?.status ?? "Not created"}</dd></div></dl>
            <Link href={`/payruns/${encodeURIComponent(scenario.payRunId)}`}>Inspect evidence →</Link>
          </article>
        ))}</div>
      </section>
    </CommandShell>
  );
}
