import Link from "next/link";

import { CommandShell } from "@/components/zenfix/command-shell";
import { Identifier } from "@/components/zenfix/identifier";
import { PayRunLifecycle } from "@/components/zenfix/lifecycle";
import { StatusBadge } from "@/components/zenfix/status-badge";
import type { PilotScenarioView, PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import { getDecisionSummary, getPrimaryStatus, SCENARIO_LABELS } from "@/features/payrun/presentation/pilot-session";

import styles from "./payrun-detail.module.css";

function EvidenceCard({ title, children }: { readonly title: string; readonly children: React.ReactNode }) { return <section className={styles.card}><h2>{title}</h2>{children}</section>; }

export function PayRunDetailView({ session, scenario }: { readonly session: PilotSessionView; readonly scenario: PilotScenarioView }) {
  const completed = scenario.actualFinalStatus === "completed";
  const review = scenario.actualFinalStatus === "pending_review";
  const whyTitle = completed ? "Why this PayRun completed" : review ? "Why this PayRun needs review" : "Why this PayRun was blocked";
  return <CommandShell active="payruns" session={session}>
    <Link className={styles.back} href="/payruns">← Pay Run Ledger</Link>
    <header className={styles.hero}><div><p>{SCENARIO_LABELS[scenario.name]} · PAYRUN</p><h1>{formatAtomicMoney(scenario.amount)} to {scenario.explanation.merchant.payee}</h1><span>Agent <Identifier value={scenario.agent.id}/> · {scenario.purpose} · PayRun <Identifier value={scenario.payRunId}/></span></div><StatusBadge status={getPrimaryStatus(scenario)}/></header>
    <section className={styles.decision}><div><span>Decision</span><strong>{getPrimaryStatus(scenario)}</strong></div><div><span>Why</span><strong>{getDecisionSummary(scenario)}</strong></div><div><span>Purpose</span><strong>{scenario.purpose}</strong></div></section>
    <section className={styles.lifecycleCard}><PayRunLifecycle scenario={scenario}/></section>
    <div className={styles.grid}>
      <EvidenceCard title={whyTitle}><p>{getDecisionSummary(scenario)}</p><dl><div><dt>Agent</dt><dd><Identifier value={scenario.agent.id}/></dd></div><div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div><div><dt>Amount</dt><dd>{formatAtomicMoney(scenario.amount)}</dd></div></dl></EvidenceCard>
      <EvidenceCard title="Policy evaluation"><p className={styles.outcome}>{scenario.policy.outcome}</p><p>{scenario.policy.policyId} · version {scenario.policy.policyVersion}</p><details className={styles.checks}><summary>Full ordered checks ({scenario.policy.checks.length})</summary><ol>{scenario.policy.checks.map(check=><li key={check.sequence}><strong>{check.reasonCode}</strong><span>{check.outcome} · {check.explanation}</span></li>)}</ol></details></EvidenceCard>
      {review?<EvidenceCard title="Approval explanation"><p>Human review is required before any downstream execution.</p><dl><div><dt>Request</dt><dd>{scenario.approval?<Identifier value={scenario.approval.requestId}/>:"Not created"}</dd></div><div><dt>Status</dt><dd>{scenario.approval?.status ?? "Not created"}</dd></div></dl></EvidenceCard>:null}
      {completed?<><EvidenceCard title="Funding preparation"><dl><div><dt>Status</dt><dd>{scenario.funding?.status}</dd></div><div><dt>Mode</dt><dd>{scenario.funding?.synthetic?"Sandbox simulation":"Not available"}</dd></div><div><dt>Reference</dt><dd>{scenario.funding?.reference?<Identifier value={scenario.funding.reference}/>:"Not required"}</dd></div></dl></EvidenceCard>
      <EvidenceCard title="Payment execution"><dl><div><dt>Status</dt><dd>{scenario.payment?.status}</dd></div><div><dt>Reference</dt><dd>{scenario.payment?.reference?<Identifier value={scenario.payment.reference}/>:"Not available"}</dd></div><div><dt>Real funds moved</dt><dd>No</dd></div></dl></EvidenceCard>
      <EvidenceCard title="Execution / Artifact proof"><dl><div><dt>Status</dt><dd>{scenario.proof?.status}</dd></div><div><dt>Reference</dt><dd>{scenario.proof?.reference?<Identifier value={scenario.proof.reference}/>:"Not available"}</dd></div><div><dt>Synthetic</dt><dd>{scenario.proof?.synthetic?"Yes":"No"}</dd></div></dl></EvidenceCard>
      <EvidenceCard title="Ledger summary"><dl><div><dt>Journal</dt><dd>{scenario.ledger?<Identifier value={scenario.ledger.journalId}/>:"Not created"}</dd></div><div><dt>Balanced</dt><dd>{scenario.ledger?.balanced?"Yes":"No"}</dd></div><div><dt>Settlement</dt><dd>Sandbox only</dd></div></dl></EvidenceCard></>:null}
      <EvidenceCard title="Audit explanation"><p>Audit events: {scenario.audit.length}</p><ol>{scenario.audit.map(event=><li key={event.sequence}><strong>{event.sequence}. {event.actionCode}</strong><span>{event.fromStatus??"none"} → {event.toStatus??scenario.actualFinalStatus} · {event.reasonCode}</span></li>)}</ol></EvidenceCard>
      {completed?<EvidenceCard title="Validation Receipt Projection"><p>This is a read-only validation projection, not a canonical receipt.</p><dl><div><dt>Kind</dt><dd>{scenario.validationReceipt.projectionKind}</dd></div><div><dt>Status</dt><dd>{scenario.validationReceipt.canonicalStatus}</dd></div><div><dt>Canonical receipt</dt><dd>Unavailable</dd></div></dl></EvidenceCard>:null}
      <EvidenceCard title="Technical evidence & provenance"><dl><div><dt>PayRun version</dt><dd>{scenario.explanation.payRunVersion}</dd></div><div><dt>Session</dt><dd><Identifier value={session.sessionId}/></dd></div><div><dt>Source commit</dt><dd><Identifier value={session.sourceCommit}/></dd></div><div><dt>Store generation</dt><dd>{session.storeGeneration}</dd></div></dl></EvidenceCard>
    </div>
  </CommandShell>;
}
