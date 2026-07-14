import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { PayRunLifecycle } from "@/components/zenfix/lifecycle";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotScenarioView, PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import {
  getDecisionSummary,
  getPrimaryStatus,
  getTrustEvidenceSummary,
  SCENARIO_LABELS,
} from "@/features/payrun/presentation/pilot-session";

import styles from "./payrun-detail.module.css";

function DetailSection({ title, level, children, className = "" }: { readonly title: string; readonly level: string; readonly children: React.ReactNode; readonly className?: string }) {
  return <section className={`${styles.card} ${className}`}><p className={styles.eyebrow}>{level}</p><h2>{title}</h2>{children}</section>;
}

export function PayRunDetailView({ session, scenario }: { readonly session: PilotSessionView; readonly scenario: PilotScenarioView }) {
  const completed = scenario.actualFinalStatus === "completed";
  const review = scenario.actualFinalStatus === "pending_review";
  const primaryStatus = getPrimaryStatus(scenario);
  const statusKey = primaryStatus.toLowerCase().replace(" ", "-");
  const statusSymbol = primaryStatus === "Completed" ? "✓" : primaryStatus === "Blocked" ? "×" : "!";
  const whyTitle = completed ? "Why this PayRun completed" : review ? "Why this PayRun needs review" : "Why this PayRun was blocked";
  const authority = getTrustEvidenceSummary(session, scenario);

  return <CommandShell active="payruns" session={session}>
    <Link className={styles.back} href="/payruns">← Back to Activity Ledger</Link>
    <header className={styles.hero}>
      <div className={styles.heroIdentity}>
        <span className={styles.agentOrb} aria-hidden="true">A</span>
        <div><p className={styles.eyebrow}>{SCENARIO_LABELS[scenario.name]} · AGENT ECONOMIC ACTION</p><h1>Why this payment happened</h1><span>{scenario.purpose}</span></div>
      </div>
      <div className={styles.finalSeal} data-status={statusKey}><span aria-hidden="true">{statusSymbol}</span><div><small>Final decision</small><StatusBadge status={primaryStatus} /><em>Sandbox only</em></div></div>
    </header>

    <section className={styles.decisionBand} aria-label="Decision explanation">
      <div className={styles.decisionPrimary}><span>Decision and authoritative reason</span><strong>{primaryStatus}</strong><p>{getDecisionSummary(scenario)}</p><small>{whyTitle}</small></div>
      <div><span>Merchant</span><strong>{scenario.explanation.merchant.payee}</strong><small><Identifier value={scenario.explanation.merchant.merchantId} /></small></div>
      <div><span>Controlled amount</span><strong>{formatAtomicMoney(scenario.amount)}</strong><small>No real funds moved</small></div>
      <div><span>Safe next action</span><strong>{scenario.explanation.nextAction === "human_review_required" ? "Human review" : scenario.explanation.nextAction === "stop" ? "Stop" : "No action"}</strong><small>{review ? "No payment attempted" : "Canonical decision applied"}</small></div>
    </section>

    <div className={styles.contextGrid}>
      <DetailSection title="Agent Context" level="LEVEL 1 · AUTHORITY">
        <dl><div><dt>Agent</dt><dd><Identifier value={scenario.agent.id} /></dd></div><div><dt>Name</dt><dd>{scenario.agent.name ?? "Not available in current pilot data"}</dd></div><div><dt>Owner</dt><dd>{scenario.agent.ownerId ?? "Not available in current pilot data"}</dd></div></dl>
      </DetailSection>
      <DetailSection title="Intent" level="LEVEL 1 · PURPOSE">
        <dl><div><dt>Purpose</dt><dd>{scenario.purpose}</dd></div><div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div><div><dt>Amount</dt><dd>{formatAtomicMoney(scenario.amount)}</dd></div></dl>
      </DetailSection>
    </div>

    <DetailSection title="Policy Decision" level="LEVEL 2 · REASON" className={styles.policyCard}>
      <div className={styles.policySummary}><span className={styles.outcome}>{scenario.policy.outcome}</span><strong>{scenario.policy.policyId} · version {scenario.policy.policyVersion}</strong><p>{getDecisionSummary(scenario)}</p></div>
      <details className={styles.checks}><summary>Full ordered checks ({scenario.policy.checks.length})</summary><ol>{scenario.policy.checks.map(check=><li key={check.sequence}><strong>{check.reasonCode}</strong><span>{check.outcome} · {check.explanation}</span></li>)}</ol></details>
    </DetailSection>

    <div className={styles.evidenceLayout}>
      <section className={styles.executionCanvas} aria-labelledby="execution-path-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CANONICAL LIFECYCLE</p><h2 id="execution-path-title">Execution and evidence path</h2></div><span>{scenario.explanation.payRunVersion} aggregate versions</span></div>
        <DetailSection title="Lifecycle Timeline" level="LEVEL 3 · EXECUTION" className={styles.timelineCard}><div className={styles.timeline}><PayRunLifecycle scenario={scenario}/></div></DetailSection>
        <div className={styles.executionGrid}>
          <DetailSection title="Approval" level="CONTROL BOUNDARY">
            <p>{review ? "Human review is required before any downstream execution." : completed ? "Human approval was not required; Policy allowed this sandbox PayRun." : "Not created; Policy blocked this PayRun before approval."}</p>
            <dl><div><dt>Request</dt><dd>{scenario.approval ? <Identifier value={scenario.approval.requestId}/> : "Not created"}</dd></div><div><dt>Status</dt><dd>{scenario.approval?.status ?? (completed ? "Not required" : "Not created")}</dd></div></dl>
          </DetailSection>
          {completed ? <>
            <DetailSection title="Funding preparation" level="EXECUTION STAGE"><strong className={styles.stageValue}>{scenario.funding?.status}</strong><p>{scenario.funding?.status === "not_required" ? "Required asset and chain already matched. No swap or bridge performed." : "Sandbox-only funding preparation; no real funds were moved."}</p><small className={styles.stageFoot}>Mode: {scenario.funding?.synthetic ? "Sandbox simulation" : "Not available"}</small></DetailSection>
            <DetailSection title="Payment execution" level="EXECUTION STAGE"><strong className={styles.stageValue}>{scenario.payment?.status}</strong><p>Deterministic Sandbox payment evidence recorded.</p><small className={styles.stageFoot}>Real funds moved: No</small></DetailSection>
            <DetailSection title="Execution / Artifact proof" level="EVIDENCE STAGE"><strong className={styles.stageValue}>{scenario.proof?.status}</strong><p>Canonical artifact evidence remains separate from payment execution.</p><small className={styles.stageFoot}>Synthetic: {scenario.proof?.synthetic ? "Yes" : "No"}</small></DetailSection>
            <DetailSection title="Ledger summary" level="ACCOUNTING STAGE"><strong className={styles.stageValue}>{scenario.ledger?.balanced ? "Balanced" : "Missing"}</strong><p>Sandbox account roles close across the journal.</p><small className={styles.stageFoot}>Settlement: Sandbox only</small></DetailSection>
          </> : null}
        </div>
        <section className={styles.auditStrip} aria-labelledby="audit-title"><div><p className={styles.eyebrow}>AUDIT EXPLANATION</p><h2 id="audit-title">Audit</h2><strong>Continuous append-only lineage</strong></div><ol>{scenario.audit.map(event=><li key={event.sequence}><span>{event.sequence}</span><div><strong>{event.actionCode}</strong><small>{event.fromStatus ?? "none"} → {event.toStatus ?? scenario.actualFinalStatus}</small></div></li>)}</ol><p>Audit events: {scenario.audit.length}</p></section>
      </section>

      <aside className={styles.authorityRail} aria-labelledby="detail-authority-title">
        <div className={styles.authorityHeading}><p className={styles.eyebrow}>AUTHORITY / EVIDENCE</p><h2 id="detail-authority-title">Authority / Evidence</h2><span>Canonical records</span></div>
        <div className={styles.authorityList}>{authority.map(item=><article data-state={item.state} key={item.label}><span aria-hidden="true">{item.state === "Present" ? "✓" : item.state === "Missing" ? "!" : "—"}</span><div><small>{item.label}</small><strong>{item.state}</strong><p>{item.detail}</p></div></article>)}</div>
        <details className={styles.technicalDisclosure}><summary>Technical evidence available</summary><p>IDs, checksums and provenance remain accessible but visually subordinate.</p></details>
      </aside>
    </div>

    {completed ? <DetailSection title="Validation Receipt Projection" level="READ-ONLY PROJECTION" className={styles.wideCard}><p>This is a read-only validation projection, not a canonical receipt.</p><dl className={styles.inlineFacts}><div><dt>Kind</dt><dd>{scenario.validationReceipt.projectionKind}</dd></div><div><dt>Status</dt><dd>{scenario.validationReceipt.canonicalStatus}</dd></div><div><dt>Canonical receipt</dt><dd>Unavailable</dd></div></dl></DetailSection> : null}

    <div className={styles.technicalGrid}>
      <DetailSection title="Technical Evidence" level="LEVEL 4 · INVESTIGATION"><dl><div><dt>PayRun</dt><dd><Identifier value={scenario.payRunId}/></dd></div><div><dt>PayRun version</dt><dd>{scenario.explanation.payRunVersion}</dd></div><div><dt>Canonical status</dt><dd>{scenario.actualFinalStatus}</dd></div></dl></DetailSection>
      <DetailSection title="Session Provenance" level="LEVEL 4 · SOURCE"><dl><div><dt>Session</dt><dd><Identifier value={session.sessionId}/></dd></div><div><dt>Source commit</dt><dd><Identifier value={session.sourceCommit}/></dd></div><div><dt>Store generation</dt><dd>{session.storeGeneration}</dd></div></dl></DetailSection>
    </div>
  </CommandShell>;
}
