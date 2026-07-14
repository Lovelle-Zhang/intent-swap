import type {
  PilotScenarioName,
  PilotSessionView,
} from "@/features/payrun/pilot/session-contracts";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";

import {
  shortenIdentifier,
  summarizePolicyChecks,
  type PolicySummaryOutcome,
} from "./presentation";
import styles from "./pilot-validation.module.css";

const LABELS: Readonly<Record<PilotScenarioName, string>> = {
  allowed: "Allowed",
  needs_review: "Needs Review",
  blocked: "Blocked",
  funding_mismatch: "Funding Mismatch",
};

const OUTCOME_SYMBOL: Readonly<Record<PolicySummaryOutcome, string>> = {
  pass: "✓",
  review: "◇",
  block: "×",
};

function Identifier({ value }: { readonly value: string }) {
  return <code className={styles.identifier} title={value}>{shortenIdentifier(value)}</code>;
}

function status(value: string | null | undefined): string {
  return value ?? "none";
}

export function PilotValidationView({ session }: { readonly session: PilotSessionView }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.watermark}>{session.watermark}</p>
        <h1>Pilot Validation Surface</h1>
        <p className={styles.intro}>Four frozen canonical PayRun outcomes for a local moderated study.</p>

        <details className={styles.provenance}>
          <summary>Session provenance</summary>
          <dl className={styles.provenanceGrid}>
            <div><dt>Session</dt><dd><Identifier value={session.sessionId} /></dd></div>
            <div><dt>Source commit</dt><dd><Identifier value={session.sourceCommit} /></dd></div>
            <div><dt>Store generation</dt><dd>{session.storeGeneration}</dd></div>
            <div><dt>Store checksum</dt><dd><Identifier value={session.storeEnvelopeChecksum} /></dd></div>
            <div><dt>Manifest checksum</dt><dd><Identifier value={session.manifestChecksum} /></dd></div>
          </dl>
        </details>
      </header>

      <div className={styles.scenarios}>
        {session.scenarios.map((scenario) => {
          const reason = scenario.policy.reasonCodes.length > 0
            ? scenario.policy.reasonCodes.join(", ")
            : "All required policy checks passed.";
          const checkSummaries = summarizePolicyChecks(scenario.policy.checks);

          return (
            <article className={styles.card} key={scenario.name}>
              <div className={styles.cardHeading}>
                <div>
                  <p className={styles.eyebrow}>Scenario</p>
                  <h2>{LABELS[scenario.name]}</h2>
                </div>
                <code className={styles.status}>{scenario.actualFinalStatus}</code>
              </div>

              <section className={styles.decision} aria-label="Decision summary">
                <div>
                  <span>Decision</span>
                  <strong>{scenario.policy.outcome}</strong>
                </div>
                <div>
                  <span>Why</span>
                  <strong>{reason}</strong>
                </div>
                <p>{formatAtomicMoney(scenario.amount)} · {scenario.explanation.merchant.payee}</p>
              </section>

              <section className={styles.policy} aria-label="Policy evaluation">
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.eyebrow}>Policy evaluation</p>
                    <h3>{scenario.policy.policyId} v{scenario.policy.policyVersion}</h3>
                  </div>
                </div>
                <ul className={styles.policyHighlights}>
                  {checkSummaries.map((check) => (
                    <li data-outcome={check.outcome} key={check.label}>
                      <span aria-hidden="true">{OUTCOME_SYMBOL[check.outcome]}</span>
                      <span>{check.label}</span>
                      <small>{check.outcome}</small>
                    </li>
                  ))}
                </ul>
                <details className={styles.policyDetails}>
                  <summary>Full policy checks ({scenario.policy.checks.length})</summary>
                  <ol>
                    {scenario.policy.checks.map((check) => (
                      <li key={check.sequence}>
                        <strong>{check.sequence}. {check.reasonCode}</strong>
                        <span>{check.outcome} · {check.explanation}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              </section>

              <dl className={styles.outcomes}>
                <div><dt>Funding</dt><dd>{scenario.funding ? `${scenario.funding.status} · ${scenario.explanation.funding.displayLabel}` : "none"}</dd></div>
                <div><dt>Payment</dt><dd>{status(scenario.payment?.status)}</dd></div>
                <div><dt>Proof</dt><dd>{status(scenario.proof?.status)}</dd></div>
                <div><dt>Ledger</dt><dd>{scenario.ledger?.balanced ? "balanced" : "none"}</dd></div>
                <div><dt>Approval</dt><dd>{status(scenario.approval?.status)}</dd></div>
              </dl>

              <details className={styles.technicalDetails}>
                <summary>Technical details</summary>
                <dl>
                  <div><dt>PayRun</dt><dd><Identifier value={scenario.payRunId} /></dd></div>
                  <div><dt>Payment reference</dt><dd>{scenario.payment?.reference ? <Identifier value={scenario.payment.reference} /> : "none"}</dd></div>
                  <div><dt>Proof reference</dt><dd>{scenario.proof?.reference ? <Identifier value={scenario.proof.reference} /> : "none"}</dd></div>
                  <div><dt>Ledger journal</dt><dd>{scenario.ledger?.journalId ? <Identifier value={scenario.ledger.journalId} /> : "none"}</dd></div>
                  <div><dt>Next action</dt><dd>{scenario.explanation.nextAction}</dd></div>
                </dl>
                <p>Validation receipt projection: {scenario.validationReceipt.projectionKind} · {scenario.validationReceipt.canonicalStatus}</p>
                <p>Canonical receipt: unavailable</p>
              </details>

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
          );
        })}
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
