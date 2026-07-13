import type { BudgetReservation, PayRun, PayRunStatus } from "../domain/types";

export interface PayRunExplanation {
  readonly projectId: string;
  readonly payRunId: string;
  readonly payRunVersion: number;
  readonly environment: "sandbox";
  readonly canonicalStatus: PayRunStatus;
  readonly merchant: { readonly merchantId: string; readonly payee: string };
  readonly amountAtomic: string;
  readonly policy: {
    readonly outcome: "allowed" | "needs_review" | "blocked" | null;
    readonly policyId: string | null;
    readonly policyVersion: number | null;
    readonly reasonCodes: readonly string[];
  };
  readonly reservation: { readonly status: BudgetReservation["status"]; readonly id: string } | null;
  readonly funding: {
    readonly status: string | null;
    readonly action: string | null;
    readonly displayLabel: string;
  };
  readonly paymentStatus: string | null;
  readonly proofStatus: string | null;
  readonly ledgerJournalId: string | null;
  readonly nextAction: "none" | "human_review_required" | "stop" | "reconcile";
  readonly canonicalReceiptAvailable: false;
  readonly realFundsMoved: false;
  readonly watermark: "SANDBOX / NO REAL FUNDS";
}

export interface ValidationReceiptProjection extends PayRunExplanation {
  readonly projectionKind: "validation_receipt";
}

export function projectPayRunExplanation(
  payRun: PayRun,
  reservation: BudgetReservation | null,
): PayRunExplanation {
  const decision = payRun.policyDecisions.at(-1);
  const nextAction = payRun.status === "pending_review"
    ? "human_review_required"
    : payRun.status === "blocked" || payRun.status === "denied" || payRun.status === "failed"
      ? "stop"
      : payRun.status === "payment_unknown" || payRun.status === "funding_preparing"
        ? "reconcile"
        : "none";
  const funding = payRun.fundingPreparation;
  return Object.freeze({
    projectId: payRun.projectId,
    payRunId: payRun.id,
    payRunVersion: payRun.version,
    environment: "sandbox" as const,
    canonicalStatus: payRun.status,
    merchant: {
      merchantId: payRun.intent.merchant.merchantId,
      payee: payRun.intent.merchant.payee,
    },
    amountAtomic: payRun.intent.quotedAmount.amountAtomic,
    policy: {
      outcome: decision?.outcome ?? null,
      policyId: decision?.policyId ?? null,
      policyVersion: decision?.policyVersion ?? null,
      reasonCodes: decision?.reasonCodes ?? [],
    },
    reservation: reservation ? { status: reservation.status, id: reservation.id } : null,
    funding: {
      status: funding?.status ?? null,
      action: funding?.action ?? null,
      displayLabel: funding?.status === "sandbox_prepared"
        ? "Simulation completed"
        : funding?.status === "not_required"
          ? "Funding not required"
          : "Not available",
    },
    paymentStatus: payRun.paymentExecution?.status ?? null,
    proofStatus: payRun.executionProof?.verificationStatus ?? null,
    ledgerJournalId: payRun.ledgerJournal?.id ?? null,
    nextAction,
    canonicalReceiptAvailable: false as const,
    realFundsMoved: false as const,
    watermark: "SANDBOX / NO REAL FUNDS" as const,
  });
}

export function projectValidationReceipt(
  explanation: PayRunExplanation,
): ValidationReceiptProjection {
  return Object.freeze({ ...explanation, projectionKind: "validation_receipt" as const });
}
