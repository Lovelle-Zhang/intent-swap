import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { PayRunLifecycle } from "@/components/zenfix/lifecycle";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotScenarioView, PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import { getDecisionSummary, getPrimaryStatus, SCENARIO_LABELS } from "@/features/payrun/presentation/pilot-session";

import styles from "./payrun-detail.module.css";

function DetailSection({ title, level, children, className = "" }: { readonly title: string; readonly level: string; readonly children: React.ReactNode; readonly className?: string }) {
  return <section className={`${styles.card} ${className}`}><p className={styles.eyebrow}>{level}</p><h2>{title}</h2>{children}</section>;
}

export function PayRunDetailView({ session, scenario }: { readonly session: PilotSessionView; readonly scenario: PilotScenarioView }) {
  const completed = scenario.actualFinalStatus === "completed";
  const review = scenario.actualFinalStatus === "pending_review";
  const whyTitle = completed ? "Why this PayRun completed" : review ? "Why this PayRun needs review" : "Why this PayRun was blocked";

  return <CommandShell active="payruns" session={session}>
    <Link className={styles.back} href="/payruns">← Pay Run Ledger</Link>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>{SCENARIO_LABELS[scenario.name]} · AGENT ECONOMIC ACTION</p><h1>Why this payment happened</h1><span>{formatAtomicMoney(scenario.amount)} to {scenario.explanation.merchant.payee}</span></div>
      <StatusBadge status={getPrimaryStatus(scenario)} />
    </header>

    <section className={styles.decisionHero} aria-label="Decision explanation">
      <div><span>Decision</span><strong>{getPrimaryStatus(scenario)}</strong></div>
      <div><span>Authoritative reason</span><strong>{getDecisionSummary(scenario)}</strong><small>{whyTitle}</small></div>
      <div><span>Safe next action</span><strong>{scenario.explanation.nextAction === "human_review_required" ? "Eligible human review; no payment attempted" : scenario.explanation.nextAction === "stop" ? "No downstream action available" : "No action required"}</strong></div>
    </section>

    <div className={styles.contextGrid}>
      <DetailSection title="Agent Context" level="LEVEL 1 · AUTHORITY">
        <dl><div><dt>Agent</dt><dd><Identifier value={scenario.agent.id} /></dd></div><div><dt>Name</dt><dd>{scenario.agent.name ?? "Not available in current pilot data"}</dd></div><div><dt>Owner</dt><dd>{scenario.agent.ownerId ?? "Not available in current pilot data"}</dd></div></dl>
      </DetailSection>
      <DetailSection title="Intent" level="LEVEL 1 · PURPOSE">
        <dl><div><dt>Purpose</dt><dd>{scenario.purpose}</dd></div><div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div><div><dt>Amount</dt><dd>{formatAtomicMoney(scenario.amount)}</dd></div></dl>
      </DetailSection>
    </div>

    <DetailSection title="Policy Decision" level="LEVEL 2 · REASON" className={styles.wideCard}>
      <div className={styles.policySummary}><span className={styles.outcome}>{scenario.policy.outcome}</span><strong>{scenario.policy.policyId} · version {scenario.policy.policyVersion}</strong><p>{getDecisionSummary(scenario)}</p></div>
      <details className={styles.checks}><summary>Full ordered checks ({scenario.policy.checks.length})</summary><ol>{scenario.policy.checks.map(check=><li key={check.sequence}><strong>{check.reasonCode}</strong><span>{check.outcome} · {check.explanation}</span></li>)}</ol></details>
    </DetailSection>

    <DetailSection title="Lifecycle Timeline" level="LEVEL 3 · EXECUTION" className={styles.wideCard}>
      <div className={styles.timeline}><PayRunLifecycle scenario={scenario}/></div>
    </DetailSection>

    <div className={styles.executionGrid}>
      <DetailSection title="Approval" level="CONTROL BOUNDARY">
        <p>{review ? "Human review is required before any downstream execution." : completed ? "Human approval was not required; Policy allowed this sandbox PayRun." : "Not created; Policy blocked this PayRun before approval."}</p>
        <dl><div><dt>Request</dt><dd>{scenario.approval ? <Identifier value={scenario.approval.requestId}/> : "Not created"}</dd></div><div><dt>Status</dt><dd>{scenario.approval?.status ?? (completed ? "Not required" : "Not created")}</dd></div></dl>
      </DetailSection>
      {completed ? <>
        <DetailSection title="Funding preparation" level="EXECUTION STAGE"><dl><div><dt>Status</dt><dd>{scenario.funding?.status}</dd></div><div><dt>Mode</dt><dd>{scenario.funding?.synthetic ? "Sandbox simulation" : "Not available"}</dd></div><div><dt>Reference</dt><dd>{scenario.funding?.reference ? <Identifier value={scenario.funding.reference}/> : "Not required"}</dd></div></dl></DetailSection>
        <DetailSection title="Payment execution" level="EXECUTION STAGE"><dl><div><dt>Status</dt><dd>{scenario.payment?.status}</dd></div><div><dt>Reference</dt><dd>{scenario.payment?.reference ? <Identifier value={scenario.payment.reference}/> : "Not available"}</dd></div><div><dt>Real funds moved</dt><dd>No</dd></div></dl></DetailSection>
        <DetailSection title="Execution / Artifact proof" level="EVIDENCE STAGE"><dl><div><dt>Status</dt><dd>{scenario.proof?.status}</dd></div><div><dt>Reference</dt><dd>{scenario.proof?.reference ? <Identifier value={scenario.proof.reference}/> : "Not available"}</dd></div><div><dt>Synthetic</dt><dd>{scenario.proof?.synthetic ? "Yes" : "No"}</dd></div></dl></DetailSection>
        <DetailSection title="Ledger summary" level="ACCOUNTING STAGE"><dl><div><dt>Journal</dt><dd>{scenario.ledger ? <Identifier value={scenario.ledger.journalId}/> : "Not created"}</dd></div><div><dt>Balanced</dt><dd>{scenario.ledger?.balanced ? "Yes" : "No"}</dd></div><div><dt>Settlement</dt><dd>Sandbox only</dd></div></dl></DetailSection>
      </> : null}
    </div>

    <DetailSection title="Audit" level="LEVEL 3 · AUTHORITATIVE LINEAGE" className={styles.wideCard}>
      <p>Audit events: {scenario.audit.length}</p><ol className={styles.auditList}>{scenario.audit.map(event=><li key={event.sequence}><strong>{event.sequence}. {event.actionCode}</strong><span>{event.fromStatus ?? "none"} → {event.toStatus ?? scenario.actualFinalStatus} · {event.reasonCode}</span></li>)}</ol>
    </DetailSection>

    {completed ? <DetailSection title="Validation Receipt Projection" level="READ-ONLY PROJECTION" className={styles.wideCard}><p>This is a read-only validation projection, not a canonical receipt.</p><dl className={styles.inlineFacts}><div><dt>Kind</dt><dd>{scenario.validationReceipt.projectionKind}</dd></div><div><dt>Status</dt><dd>{scenario.validationReceipt.canonicalStatus}</dd></div><div><dt>Canonical receipt</dt><dd>Unavailable</dd></div></dl></DetailSection> : null}

    <div className={styles.technicalGrid}>
      <DetailSection title="Technical Evidence" level="LEVEL 4 · INVESTIGATION"><dl><div><dt>PayRun</dt><dd><Identifier value={scenario.payRunId}/></dd></div><div><dt>PayRun version</dt><dd>{scenario.explanation.payRunVersion}</dd></div><div><dt>Canonical status</dt><dd>{scenario.actualFinalStatus}</dd></div></dl></DetailSection>
      <DetailSection title="Session Provenance" level="LEVEL 4 · SOURCE"><dl><div><dt>Session</dt><dd><Identifier value={session.sessionId}/></dd></div><div><dt>Source commit</dt><dd><Identifier value={session.sourceCommit}/></dd></div><div><dt>Store generation</dt><dd>{session.storeGeneration}</dd></div></dl></DetailSection>
    </div>
  </CommandShell>;
}
