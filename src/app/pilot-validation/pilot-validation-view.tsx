import type { PilotScenarioName, PilotSessionView } from "@/features/payrun/pilot/session-contracts";

import styles from "./pilot-validation.module.css";

const LABELS: Readonly<Record<PilotScenarioName, string>> = {
  allowed: "Allowed",
  needs_review: "Needs Review",
  blocked: "Blocked",
  funding_mismatch: "Funding Mismatch",
};

export function PilotValidationView({ session }: { readonly session: PilotSessionView }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.watermark}>{session.watermark}</p>
        <h1>Pilot Validation Surface</h1>
        <p>Frozen canonical PayRun explanations for a local moderated study.</p>
        <dl className={styles.provenance}>
          <div><dt>Session</dt><dd>{session.sessionId}</dd></div>
          <div><dt>Source commit</dt><dd>{session.sourceCommit}</dd></div>
          <div><dt>Store generation</dt><dd>{session.storeGeneration}</dd></div>
          <div><dt>Store checksum</dt><dd>{session.storeEnvelopeChecksum}</dd></div>
          <div><dt>Manifest checksum</dt><dd>{session.manifestChecksum}</dd></div>
        </dl>
      </header>

      <div className={styles.scenarios}>
        {session.scenarios.map((scenario) => (
          <article className={styles.card} key={scenario.name}>
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.eyebrow}>Scenario</p>
                <h2>{LABELS[scenario.name]}</h2>
              </div>
              <code>{scenario.actualFinalStatus}</code>
            </div>

            <dl className={styles.summary}>
              <div><dt>PayRun</dt><dd>{scenario.payRunId}</dd></div>
              <div><dt>Merchant</dt><dd>{scenario.explanation.merchant.payee}</dd></div>
              <div><dt>Amount atomic</dt><dd>{scenario.explanation.amountAtomic} USDC</dd></div>
              <div><dt>Policy</dt><dd>{scenario.policy.policyId} v{scenario.policy.policyVersion}</dd></div>
              <div><dt>Decision</dt><dd>{scenario.policy.outcome}</dd></div>
              <div><dt>Reasons</dt><dd>{scenario.policy.reasonCodes.join(", ")}</dd></div>
              <div><dt>Ordered checks</dt><dd>{scenario.policy.checks.map((check) => `${check.sequence}. ${check.reasonCode} (${check.outcome})`).join(" · ")}</dd></div>
              <div><dt>Approval</dt><dd>{scenario.approval?.status ?? "none"}</dd></div>
              <div><dt>Funding</dt><dd>{scenario.funding ? `${scenario.funding.status} · ${scenario.explanation.funding.displayLabel}` : "none"}</dd></div>
              <div><dt>Payment</dt><dd>{scenario.payment ? `${scenario.payment.status} · ${scenario.payment.reference}` : "none"}</dd></div>
              <div><dt>Proof</dt><dd>{scenario.proof ? `${scenario.proof.status} · ${scenario.proof.reference}` : "none"}</dd></div>
              <div><dt>Ledger</dt><dd>{scenario.ledger?.journalId ?? "none"}</dd></div>
              <div><dt>Next action</dt><dd>{scenario.explanation.nextAction}</dd></div>
            </dl>

            <p className={styles.receipt}>
              Validation receipt projection: {scenario.validationReceipt.projectionKind} · {scenario.validationReceipt.canonicalStatus}
            </p>
            <p className={styles.receipt}>Canonical receipt: unavailable</p>
            <p className={styles.safety}>{session.watermark} · Real funds moved: no</p>

            <details className={styles.audit}>
              <summary>Audit explanation ({scenario.audit.length} events)</summary>
              <ol>
                {scenario.audit.map((event) => (
                  <li key={event.sequence}>
                    <strong>Audit sequence {event.sequence}</strong>{" "}
                    {event.fromStatus ?? "none"} → {event.toStatus ?? scenario.actualFinalStatus}{" "}
                    <span>{event.reasonCode}</span>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </div>
    </main>
  );
}

export function PilotValidationErrorView({ message }: { readonly message: string }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.watermark}>SANDBOX / NO REAL FUNDS</p>
        <h1>Pilot Validation Surface</h1>
        <p role="alert">{message}</p>
      </header>
    </main>
  );
}
