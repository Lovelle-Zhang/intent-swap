import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { PayRunLifecycle } from "@/components/zenfix/lifecycle";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotScenarioView, PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import {
  getCommandCenterMetrics,
  getDecisionSummary,
  getFocusedPilotScenario,
  getObservedAgentFleet,
  getPrimaryStatus,
  SCENARIO_LABELS,
} from "@/features/payrun/presentation/pilot-session";

import styles from "./command-center.module.css";

function evidenceSummary(scenario: PilotScenarioView): string {
  if (scenario.actualFinalStatus !== "completed") return "No downstream evidence created";
  return [
    scenario.payment?.status ? `Payment ${scenario.payment.status}` : "Payment missing",
    scenario.proof?.status ? `Proof ${scenario.proof.status}` : "Proof missing",
    scenario.ledger?.balanced ? "Ledger balanced" : "Ledger missing",
  ].join(" · ");
}

function utcDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CommandCenterView({ session }: { readonly session: PilotSessionView }) {
  const metrics = getCommandCenterMetrics(session);
  const fleet = getObservedAgentFleet(session);
  const focused = getFocusedPilotScenario(session);
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
          <p className={styles.eyebrow}>AGENT OPERATIONS</p>
          <h1>ZenFix Command Center</h1>
          <span>Agent Payment Intelligence &amp; Governance</span>
        </div>
        <div className={styles.sessionSignal}>
          <span className={styles.signalDot} aria-hidden="true" />
          <div><strong>Immutable session verified</strong><small>Session date: {session.createdAt.slice(0, 10)} UTC · Generation {session.storeGeneration}</small></div>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Current Pilot Session metrics">
        {cards.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Current immutable pilot session</small>
            <small>Sandbox only</small>
          </article>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="agent-fleet-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>OBSERVED AUTHORITY</p><h2 id="agent-fleet-title">Agent Fleet</h2></div>
          <p>Canonical activity observed in this Pilot Session—not runtime telemetry.</p>
        </div>
        <div className={styles.fleetGrid}>
          {fleet.map((agent) => (
            <article className={styles.agentCard} key={agent.agentId}>
              <div className={styles.agentHeader}>
                <div className={styles.agentIdentity}>
                  <span className={styles.agentGlyph} aria-hidden="true">A</span>
                  <div><strong>{agent.agentName ?? "Not available in current pilot data"}</strong><Identifier value={agent.agentId} /></div>
                </div>
                <span className={styles.observedBadge}>Observed</span>
              </div>
              <p className={styles.observedCaption}>Observed in current pilot session</p>
              <div className={styles.agentStats}>
                <div><span>Pay Runs</span><strong>{agent.observedPayRuns}</strong></div>
                <div><span>Completed</span><strong>{agent.completed}</strong></div>
                <div><span>Needs Review</span><strong>{agent.needsReview}</strong></div>
                <div><span>Blocked Activity</span><strong>{agent.blocked}</strong></div>
                <div><span>Controlled Spend</span><strong>{formatAtomicMoney(agent.controlledSpend)}</strong></div>
              </div>
              <dl className={styles.agentContext}>
                <div><dt>Purpose</dt><dd>{agent.purposes.join(" · ") || "Not available in current pilot data"}</dd></div>
                <div><dt>Owner</dt><dd>{agent.ownerId ?? "Not available in current pilot data"}</dd></div>
                <div><dt>Capabilities</dt><dd>Not available in current pilot data</dd></div>
                <div><dt>Latest activity</dt><dd>{utcDate(agent.latestActivityAt)} UTC</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.flowSection}`} aria-labelledby="payment-flow-title">
        <div className={styles.flowDecision}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>FOCUSED DECISION</p><h2 id="payment-flow-title">Payment Control Flow</h2></div>
            <StatusBadge status={getPrimaryStatus(focused)} />
          </div>
          <div className={styles.decisionGrid}>
            <div><span>Decision</span><strong>{getPrimaryStatus(focused)}</strong></div>
            <div><span>Reason</span><strong>{getDecisionSummary(focused)}</strong></div>
            <div><span>Agent intent</span><strong>{focused.purpose}</strong></div>
            <div><span>Merchant / amount</span><strong>{focused.explanation.merchant.payee} · {formatAtomicMoney(focused.amount)}</strong></div>
          </div>
          <p className={styles.focusRule}>Focused by deterministic priority: Needs Review → Blocked → Failed → latest Completed.</p>
        </div>
        <div className={styles.flowCanvas}>
          <PayRunLifecycle scenario={focused} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="activity-stream-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>CANONICAL ECONOMIC ACTIONS</p><h2 id="activity-stream-title">Agent Activity Stream</h2></div>
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
