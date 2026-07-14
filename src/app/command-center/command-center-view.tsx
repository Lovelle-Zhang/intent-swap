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
  getPrimaryStatus,
  getTrustEvidenceSummary,
  SCENARIO_LABELS,
} from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";
import { DecisionQueue } from "./decision-queue";
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
      <header className={styles.identityBand}>
        <div>
          <p className={styles.eyebrow}>AGENT PAYMENT INTELLIGENCE &amp; GOVERNANCE</p>
          <h1>ZenFix Command Center</h1>
          <span>Agent Payment Intelligence &amp; Governance</span>
        </div>
        <div className={styles.sessionState}>
          <span aria-hidden="true" />
          <div><strong>SANDBOX / NO REAL FUNDS</strong><small>Immutable Pilot Session · Generation {session.storeGeneration} · {session.createdAt.slice(0, 10)} UTC</small></div>
        </div>
      </header>

      <div className={styles.governanceLayout}>
        <section className={styles.governanceCanvas} aria-labelledby="governance-title">
          <div className={styles.canvasHeading}>
            <div><span>Focused PayRun</span><Identifier value={focused.payRunId} /></div>
            <small>Read-only canonical view</small>
          </div>
          <DecisionQueue attention={attention} />
          <div className={styles.flowHeading}>
            <div><p className={styles.eyebrow}>CANONICAL CONTROL PATH</p><h2 id="governance-title">Payment Governance Canvas</h2></div>
            <span>Intent → Policy → Approval → Funding → Payment → Proof → Ledger</span>
          </div>
          <div className={styles.flowCanvas}><PayRunLifecycle scenario={focused} /></div>
          <div className={styles.canvasReason}>
            <span aria-hidden="true" />
            <div><strong>Why attention is required</strong><p>{attention.reason} Reservation, funding, payment, proof and ledger remain absent by policy.</p></div>
          </div>
        </section>
        <TrustEvidenceSummary items={getTrustEvidenceSummary(session, focused)} />
      </div>

      <section className={styles.summaryStrip} aria-label="Current Pilot Session metrics">
        <div className={styles.summaryContext}><strong>Current immutable pilot session</strong><span>Sandbox only · {session.createdAt.slice(0, 10)} UTC</span></div>
        {cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
      </section>

      <section className={styles.activityLedger} aria-labelledby="activity-ledger-title">
        <div className={styles.activityHeading}>
          <div><p className={styles.eyebrow}>RECENT CANONICAL ECONOMIC ACTIONS</p><h2 id="activity-ledger-title">Activity Ledger</h2><span>Recent canonical economic actions</span></div>
          <Link href="/payruns">Open Pay Run Ledger →</Link>
        </div>
        <div className={styles.activityStream}>
          {activity.map((scenario) => (
            <article className={styles.activityRow} key={scenario.payRunId}>
              <div className={styles.activityAgent}><span className={styles.activityMarker} data-status={getPrimaryStatus(scenario)} aria-hidden="true" /><div><strong>{SCENARIO_LABELS[scenario.name]}</strong><small>{scenario.purpose}</small></div></div>
              <div className={styles.activityDecision}><StatusBadge status={getPrimaryStatus(scenario)} /><p>{getDecisionSummary(scenario)}</p></div>
              <dl className={styles.activityFacts}>
                <div><dt>Agent</dt><dd><Identifier value={scenario.agent.id} /></dd></div>
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
