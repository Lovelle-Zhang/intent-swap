import { sha256Canonical } from "../storage/canonical-json";
import type { ExecutionProof, LedgerDraft, LedgerJournal, PaymentExecution } from "../../domain/types";

export function buildSandboxLedgerDraft(
  payment: PaymentExecution,
  proof: ExecutionProof,
  occurredAt: string,
): LedgerDraft {
  const journalId = `ledger_${payment.payRunId}`;
  const amount = payment.instruction.amount.amountAtomic;
  const projectId = payment.projectId;
  const evidenceHash = proof.checksum;
  return {
    id: `ledger_draft_${payment.payRunId}`,
    projectId,
    payRunId: payment.payRunId,
    paymentExecutionId: payment.id,
    executionProofId: proof.id,
    environment: "sandbox",
    assetRef: payment.instruction.target,
    externalReference: payment.providerReference!,
    evidenceHash,
    entries: [
      {
        id: `ledger_entry_debit_${payment.payRunId}`,
        projectId,
        journalId,
        accountId: `sandbox:${projectId}:sandbox_merchant_payable`,
        accountRole: "sandbox_merchant_payable",
        debitAtomic: amount,
        creditAtomic: "0",
        evidenceHash,
      },
      {
        id: `ledger_entry_credit_${payment.payRunId}`,
        projectId,
        journalId,
        accountId: `sandbox:${projectId}:sandbox_funding_source`,
        accountRole: "sandbox_funding_source",
        debitAtomic: "0",
        creditAtomic: amount,
        evidenceHash,
      },
    ],
    preparedAt: occurredAt,
  };
}

export function commitSandboxLedger(
  draft: LedgerDraft,
  occurredAt: string,
): LedgerJournal {
  const journal: LedgerJournal = {
    id: `ledger_${draft.payRunId}`,
    projectId: draft.projectId,
    payRunId: draft.payRunId,
    version: 1,
    paymentExecutionId: draft.paymentExecutionId,
    executionProofId: draft.executionProofId,
    environment: draft.environment,
    assetRef: draft.assetRef,
    externalReference: draft.externalReference,
    evidenceHash: draft.evidenceHash,
    entries: draft.entries,
    committedAt: occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  void sha256Canonical(journal);
  return journal;
}
