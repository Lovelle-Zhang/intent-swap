import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { PayRunLifecycle } from "@/components/zenfix/lifecycle";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotScenarioView, PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import {
  getCommandCenterAttention,
  getCommandCenterMetrics,
  getDecisionSummary,
  getObservedAgentFleet,
  getPrimaryStatus,
  getTrustEvidenceSummary,
  SCENARIO_LABELS,
} from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";
import { DecisionQueue } from "./decision-queue";
import { ObservedAgentPanel } from "./observed-agent-panel";
import { TrustEvidenceSummary } from "./trust-evidence-summary";

function evidenceSummary(scenario: PilotScenarioView): string {
  if (scenario.actualFinalStatus !== "completed") return "No downstream evidence created";
  return [
    scenario.payment?.status ? `Payment ${scenario.payment.status}` : "Payment missing",
    scenario.proof?.status ? `Proof ${scenario.proof.status}` : "Proof missing",
    scenario.ledger?.balanced ? "Ledger balanced" : "Ledger missing",
  ].join(" · ");
}

export function CommandCenterView({ session }: { readonly session: PilotSessionView }) {
  const metrics = getCommandCenterMetrics(session);
  const attention = getCommandCenterAttention(session);
  const focused = attention.scenario;
  const cards = [
    ["Observed Agents", metrics.observedAgents],
    ["Session Pay Runs", metrics.sessionPayRuns],
    ["Completed", metrics.completed],
    ["Needs Review", metrics.needsReview],
    ["Blocked", metrics.blocked],
    ["Controlled Spend", formatAtomicMoney(metrics.controlledSpend)],
  ] as const;
  const activity = [...session.scenarios].sort((left, right) =>
    Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.payRunId.localeCompare(right.payRunId));

  return (
    <CommandShell active="command-center" session={session}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>AGENT PAYMENT CONTROL LAYER</p>
          <h1>ZenFix Command Center</h1>
          <span>Agent Payment Intelligence &amp; Governance</span>
        </div>
        <div className={styles.sandboxWatermark}><span aria-hidden="true" />SANDBOX / NO REAL FUNDS</div>
      </header>

      <DecisionQueue attention={attention} />

      <section className={`${styles.panel} ${styles.flowPanel}`} aria-labelledby="payment-flow-title">
        <div className={styles.panelHeading}>
          <div><p className={styles.eyebrow}>CANONICAL CONTROL PATH</p><h2 id="payment-flow-title">Payment Control Flow</h2></div>
          <div className={styles.flowOutcome}><StatusBadge status={attention.decision} /><span>{attention.stageLabel} stage</span></div>
        </div>
        <p className={styles.flowReason}>{attention.reason}</p>
        <div className={styles.flowCanvas}><PayRunLifecycle scenario={focused} /></div>
      </section>

      <TrustEvidenceSummary items={getTrustEvidenceSummary(session, focused)} />

      <section className={styles.summaryStrip} aria-label="Current Pilot Session metrics">
        <div className={styles.summaryContext}><strong>Current immutable pilot session</strong><span>Sandbox only · {session.createdAt.slice(0, 10)} UTC</span></div>
        {cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>

      <ObservedAgentPanel agents={getObservedAgentFleet(session)} />

      <section className={`${styles.panel} ${styles.activityPanel}`} aria-labelledby="activity-stream-title">
        <div className={styles.panelHeading}>
          <div><p className={styles.eyebrow}>RECENT CANONICAL ACTIONS</p><h2 id="activity-stream-title">Agent Activity Stream</h2></div>
          <Link href="/payruns">Open Pay Run Ledger →</Link>
        </div>
        <div className={styles.activityStream}>
          {activity.map((scenario) => (
            <article className={styles.activityRow} key={scenario.payRunId}>
              <div className={styles.activityAgent}><span className={styles.agentGlyph} aria-hidden="true">A</span><div><strong><Identifier value={scenario.agent.id} /></strong><small>{scenario.purpose}</small></div></div>
              <div className={styles.activityDecision}><StatusBadge status={getPrimaryStatus(scenario)} /><strong>{SCENARIO_LABELS[scenario.name]}</strong><p>{getDecisionSummary(scenario)}</p></div>
              <dl className={styles.activityFacts}>
                <div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div>
                <div><dt>Amount</dt><dd>{formatAtomicMoney(scenario.amount)}</dd></div>
                <div><dt>Evidence</dt><dd>{evidenceSummary(scenario)}</dd></div>
              </dl>
              <Link href={`/payruns/${encodeURIComponent(scenario.payRunId)}`}>View evidence <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </div>
      </section>
    </CommandShell>
  );
}
