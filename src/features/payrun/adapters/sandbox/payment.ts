import { sha256Canonical } from "../storage/canonical-json";
import type { FundingPreparation, PayIntent, PaymentExecution } from "../../domain/types";
import { SANDBOX_RAIL } from "./fixtures";

export function prepareSandboxPayment(
  intent: PayIntent,
  funding: FundingPreparation,
  occurredAt: string,
): PaymentExecution {
  const id = `payment_${intent.payRunId}`;
  const executionKey = `sandbox-payment:${intent.payRunId}`;
  const instructionHash = sha256Canonical({
    fundingPreparationId: funding.id,
    merchantId: intent.merchant.merchantId,
    amount: intent.quotedAmount,
    target: intent.settlementTarget,
    rail: SANDBOX_RAIL,
  });
  return {
    id,
    projectId: intent.projectId,
    payRunId: intent.payRunId,
    version: 1,
    instruction: {
      id: `payment_instruction_${intent.payRunId}`,
      projectId: intent.projectId,
      payRunId: intent.payRunId,
      fundingPreparationId: funding.id,
      merchantId: intent.merchant.merchantId,
      rail: SANDBOX_RAIL,
      amount: intent.quotedAmount,
      target: intent.settlementTarget,
      instructionHash,
      executionKey,
      createdAt: occurredAt,
    },
    status: "prepared",
    providerReference: null,
    reconciliationState: "not_required",
    attempts: [{
      id: `payment_attempt_${intent.payRunId}`,
      projectId: intent.projectId,
      payRunId: intent.payRunId,
      paymentExecutionId: id,
      executionKey,
      instructionHash,
      outcome: "prepared",
      createdAt: occurredAt,
    }],
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

export function completeSandboxPayment(
  current: PaymentExecution,
  occurredAt: string,
): PaymentExecution {
  const providerReference = `sandbox:payment:${current.id}`;
  const evidence = {
    environment: "sandbox" as const,
    kind: "sandbox_payment_evidence" as const,
    provider: "sandbox_simulated",
    reference: providerReference,
    observedStatus: "succeeded",
    checksum: sha256Canonical({ paymentExecutionId: current.id, instructionHash: current.instruction.instructionHash }),
    capturedAt: occurredAt,
    verificationMethod: "deterministic_fixture",
    synthetic: true,
    transactionHash: null,
  };
  return {
    ...current,
    version: current.version + 1,
    status: "succeeded",
    providerReference,
    evidence,
    attempts: current.attempts.map((attempt) => ({ ...attempt, outcome: "final_success" as const })),
    updatedAt: occurredAt,
  };
}

export function failSandboxPaymentWithoutTransfer(
  current: PaymentExecution,
  occurredAt: string,
): PaymentExecution {
  const providerReference = `sandbox:payment-failed:${current.id}`;
  return {
    ...current,
    version: current.version + 1,
    status: "failed_no_transfer",
    providerReference,
    reconciliationState: "not_required",
    evidence: {
      environment: "sandbox",
      kind: "sandbox_no_transfer_evidence",
      provider: "sandbox_simulated",
      reference: providerReference,
      observedStatus: "authoritative_no_transfer",
      checksum: sha256Canonical({
        paymentExecutionId: current.id,
        instructionHash: current.instruction.instructionHash,
        outcome: "failed_no_transfer",
      }),
      capturedAt: occurredAt,
      verificationMethod: "deterministic_fixture",
      synthetic: true,
      transactionHash: null,
    },
    attempts: current.attempts.map((attempt) => ({
      ...attempt,
      outcome: "final_failure" as const,
    })),
    updatedAt: occurredAt,
  };
}
