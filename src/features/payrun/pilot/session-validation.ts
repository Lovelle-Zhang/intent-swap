import { PilotScenarioMappingError, PilotSessionIncompleteError, PilotStoreIntegrityError } from "./session-errors";
import { PILOT_EXPECTED_STATUS, PILOT_SCENARIO_NAMES, type PilotScenarioName, type PilotSessionManifest } from "./session-contracts";
import type { LocalJsonStoreEnvelope } from "../adapters/storage/store-envelope";
import type { AuditEvent, BudgetReservation, LedgerJournal, PayRun } from "../domain/types";

export interface ValidatedPilotScenario {
  readonly name: PilotScenarioName;
  readonly payRun: PayRun;
  readonly reservation: BudgetReservation | null;
  readonly ledger: LedgerJournal | null;
  readonly audit: readonly AuditEvent[];
}

function fail(message: string): never {
  throw new PilotScenarioMappingError(message);
}

function noDownstream(payRun: PayRun, reservation: BudgetReservation | null, ledger: LedgerJournal | null): void {
  if (reservation || payRun.fundingPreparation || payRun.paymentExecution || payRun.proofRequest || payRun.executionProof || payRun.ledgerDraft || payRun.ledgerJournal || ledger) {
    fail("Stopped Pilot scenario contains forbidden downstream records");
  }
}

function assertBalanced(journal: LedgerJournal): void {
  let debits = 0n;
  let credits = 0n;
  for (const entry of journal.entries) {
    debits += BigInt(entry.debitAtomic);
    credits += BigInt(entry.creditAtomic);
  }
  if (debits <= 0n || debits !== credits) throw new PilotStoreIntegrityError("Pilot Ledger is not balanced");
}

function assertLineage(payRun: PayRun, envelope: LocalJsonStoreEnvelope): readonly AuditEvent[] {
  const audit = envelope.payload.auditEvents
    .filter((event) => event.projectId === payRun.projectId && event.payRunId === payRun.id)
    .sort((left, right) => left.sequence - right.sequence);
  const outbox = envelope.payload.domainOutboxEvents
    .filter((event) => event.projectId === payRun.projectId && event.aggregateId === payRun.id)
    .sort((left, right) => left.sequence - right.sequence);
  if (audit.length !== payRun.lastAuditSequence || outbox.length !== payRun.lastOutboxSequence) {
    throw new PilotStoreIntegrityError("Pilot Audit or Outbox lineage length is incomplete");
  }
  for (let index = 0; index < audit.length; index += 1) {
    if (audit[index]!.sequence !== index + 1 || audit[index]!.afterVersion !== index + 1) {
      throw new PilotStoreIntegrityError("Pilot Audit lineage is discontinuous");
    }
  }
  for (let index = 0; index < outbox.length; index += 1) {
    if (outbox[index]!.sequence !== index + 1 || outbox[index]!.aggregateVersion !== index + 1) {
      throw new PilotStoreIntegrityError("Pilot Outbox lineage is discontinuous");
    }
  }
  if (audit.at(-1)?.afterVersion !== payRun.version || outbox.at(-1)?.aggregateVersion !== payRun.version) {
    throw new PilotStoreIntegrityError("Pilot lineage does not reach the canonical PayRun version");
  }
  return audit;
}

function assertSandboxEvidence(payRun: PayRun): void {
  if (payRun.environment !== "sandbox") fail("Pilot PayRun must be Sandbox-only");
  const evidence = [
    payRun.fundingPreparation?.evidence,
    payRun.paymentExecution?.evidence,
    payRun.executionProof?.evidence,
  ].filter((value) => value !== undefined);
  for (const item of evidence) {
    if (item.environment !== "sandbox" || !item.synthetic || item.transactionHash !== null || !item.kind.startsWith("sandbox_")) {
      fail("Pilot evidence contains a live-money claim");
    }
  }
}

function validateScenario(name: PilotScenarioName, payRun: PayRun, reservation: BudgetReservation | null, ledger: LedgerJournal | null): void {
  assertSandboxEvidence(payRun);
  if (payRun.status !== PILOT_EXPECTED_STATUS[name]) fail("Canonical PayRun final status does not match frozen scenario");
  switch (name) {
    case "allowed":
      if (payRun.intent.quotedAmount.amountAtomic !== "420000" || payRun.fundingPreparation?.status !== "not_required" || payRun.fundingPreparation.action !== "none" || payRun.approval || reservation?.status !== "consumed" || payRun.paymentExecution?.status !== "succeeded" || payRun.executionProof?.verificationStatus !== "verified" || !ledger) {
        fail("Allowed scenario contract is incomplete");
      }
      assertBalanced(ledger);
      break;
    case "needs_review":
      if (payRun.intent.quotedAmount.amountAtomic !== "440000" || payRun.policyDecisions.at(-1)?.outcome !== "needs_review" || payRun.approval?.status !== "pending") {
        fail("Needs Review scenario contract is incomplete");
      }
      noDownstream(payRun, reservation, ledger);
      break;
    case "blocked":
      if (payRun.intent.quotedAmount.amountAtomic !== "8000000" || payRun.intent.merchant.trustState !== "unknown" || payRun.policyDecisions.at(-1)?.outcome !== "blocked" || !payRun.policyDecisions.at(-1)?.reasonCodes.includes("merchant.unknown") || payRun.approval) {
        fail("Blocked scenario contract is incomplete");
      }
      noDownstream(payRun, reservation, ledger);
      break;
    case "funding_mismatch":
      if (payRun.intent.quotedAmount.amountAtomic !== "420000" || payRun.intent.requestedFundingSource?.asset !== "ETH" || payRun.intent.requestedFundingSource.chainFamily !== "ethereum" || payRun.intent.settlementTarget.asset !== "USDC" || payRun.intent.settlementTarget.chainFamily !== "base" || payRun.fundingPreparation?.status !== "sandbox_prepared" || payRun.fundingPreparation.transactionHash !== null || payRun.fundingPreparation.realFundsAvailable || payRun.fundingPreparation.realBridgeCapability || payRun.fundingPreparation.route.some((step) => !step.simulated) || reservation?.status !== "consumed" || !ledger) {
        fail("Funding Mismatch scenario contract is incomplete");
      }
      assertBalanced(ledger);
      break;
  }
}

export function validatePilotSessionRecords(
  manifest: PilotSessionManifest,
  envelope: LocalJsonStoreEnvelope,
): readonly ValidatedPilotScenario[] {
  if (manifest.storeGeneration !== envelope.storeGeneration || manifest.storeEnvelopeChecksum !== envelope.envelopeChecksum) {
    throw new PilotStoreIntegrityError("Manifest is not bound to this canonical store envelope");
  }
  if (manifest.scenarios.length !== 4 || envelope.payload.payRuns.length !== 4) {
    throw new PilotSessionIncompleteError("Pilot Session must contain exactly four PayRuns");
  }
  const projectIds = new Set(envelope.payload.payRuns.map((payRun) => payRun.projectId));
  if (projectIds.size !== 1) fail("Pilot PayRuns must share one Project");

  return PILOT_SCENARIO_NAMES.map((name, index) => {
    const mapping = manifest.scenarios[index]!;
    if (mapping.name !== name || mapping.expectedFinalStatus !== PILOT_EXPECTED_STATUS[name]) {
      fail("Manifest scenario expectation is not frozen");
    }
    const payRun = envelope.payload.payRuns.find((candidate) => candidate.id === mapping.payRunId);
    if (!payRun) throw new PilotSessionIncompleteError("Mapped canonical PayRun is missing");
    if (mapping.actualFinalStatus !== payRun.status || mapping.expectedFinalStatus !== payRun.status) {
      fail("Manifest status does not match canonical PayRun status");
    }
    const reservation = envelope.payload.budgetReservations.find((candidate) => candidate.payRunId === payRun.id) ?? null;
    const ledger = envelope.payload.ledgerJournals.find((candidate) => candidate.payRunId === payRun.id) ?? null;
    validateScenario(name, payRun, reservation, ledger);
    const audit = assertLineage(payRun, envelope);
    return { name, payRun, reservation, ledger, audit };
  });
}
