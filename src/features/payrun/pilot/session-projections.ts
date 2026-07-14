import { deepFreeze } from "../domain/invariants";
import { projectPayRunExplanation, projectValidationReceipt } from "../application/payrun-explanation";
import type { EvidenceReference } from "../domain/types";
import type { LocalJsonStoreEnvelope } from "../adapters/storage/store-envelope";
import {
  PILOT_WATERMARK,
  type PilotAuditExplanation,
  type PilotEvidenceSummary,
  type PilotScenarioView,
  type PilotSessionManifest,
  type PilotSessionView,
} from "./session-contracts";
import { validatePilotSessionRecords } from "./session-validation";

function evidenceSummary(status: string, evidence: EvidenceReference | undefined): PilotEvidenceSummary {
  return {
    status,
    reference: evidence?.reference ?? null,
    synthetic: evidence?.synthetic ?? true,
    transactionHash: null,
  };
}

export function derivePilotSessionView(
  manifest: PilotSessionManifest,
  envelope: LocalJsonStoreEnvelope,
): PilotSessionView {
  const validated = validatePilotSessionRecords(manifest, envelope);
  const scenarios: PilotScenarioView[] = validated.map(({ name, payRun, reservation, ledger, audit }) => {
    const explanation = projectPayRunExplanation(payRun, reservation);
    const decision = payRun.policyDecisions.at(-1)!;
    const auditExplanation: PilotAuditExplanation[] = audit.map((event) => ({
      sequence: event.sequence,
      beforeVersion: event.beforeVersion,
      afterVersion: event.afterVersion,
      actionCode: event.actionCode,
      reasonCode: event.reasonCode,
      actorType: event.actor.actorType,
      occurredAt: event.occurredAt,
      fromStatus: typeof event.details.fromStatus === "string" ? event.details.fromStatus : null,
      toStatus: typeof event.details.toStatus === "string" ? event.details.toStatus : null,
    }));
    return {
      name,
      payRunId: payRun.id,
      actualFinalStatus: payRun.status as PilotScenarioView["actualFinalStatus"],
      agent: { id: payRun.intent.agentId, name: null, ownerId: null },
      purpose: payRun.intent.purpose,
      createdAt: payRun.intent.createdAt,
      amount: {
        amountAtomic: payRun.intent.quotedAmount.amountAtomic,
        asset: payRun.intent.quotedAmount.asset,
        decimals: payRun.intent.quotedAmount.decimals,
      },
      explanation,
      validationReceipt: projectValidationReceipt(explanation),
      policy: {
        outcome: decision.outcome,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        reasonCodes: [...decision.reasonCodes],
        checks: decision.checks.map((check) => ({
          sequence: check.sequence,
          ruleClass: check.ruleClass,
          reasonCode: check.reasonCode,
          outcome: check.outcome,
          explanation: check.explanation,
        })),
      },
      approval: payRun.approval ? { status: payRun.approval.status, requestId: payRun.approval.request.id } : null,
      funding: payRun.fundingPreparation ? evidenceSummary(payRun.fundingPreparation.status, payRun.fundingPreparation.evidence) : null,
      payment: payRun.paymentExecution ? evidenceSummary(payRun.paymentExecution.status, payRun.paymentExecution.evidence) : null,
      proof: payRun.executionProof ? evidenceSummary(payRun.executionProof.verificationStatus, payRun.executionProof.evidence) : null,
      ledger: ledger ? { journalId: ledger.id, balanced: true } : null,
      audit: auditExplanation,
    };
  });
  return deepFreeze({
    sessionId: manifest.sessionId,
    createdAt: manifest.createdAt,
    sourceCommit: manifest.sourceCommit,
    storeGeneration: envelope.storeGeneration,
    storeEnvelopeChecksum: envelope.envelopeChecksum,
    manifestChecksum: manifest.manifestChecksum,
    preparationCommandVersion: manifest.preparationCommandVersion,
    sandboxOnly: true,
    watermark: PILOT_WATERMARK,
    scenarios,
  });
}
