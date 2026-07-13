import { sha256Canonical } from "../storage/canonical-json";
import type { BudgetReservation, FundingPreparation, PolicyDecision } from "../../domain/types";
import type { SandboxScenarioFixture } from "./fixtures";

export function prepareSandboxFunding(
  fixture: SandboxScenarioFixture,
  reservation: BudgetReservation,
  decision: PolicyDecision,
  occurredAt: string,
): FundingPreparation {
  const id = `funding_${fixture.intent.payRunId}`;
  const executionKey = `sandbox-funding:${fixture.intent.payRunId}`;
  const source = fixture.intent.requestedFundingSource ?? {
    chainFamily: "base",
    asset: "USDC",
    accountRef: `sandbox:${fixture.project.id}:reserved_usdc`,
    amountAtomic: fixture.intent.quotedAmount.amountAtomic,
    decimals: 6,
  };
  return {
    id,
    projectId: fixture.project.id,
    payRunId: fixture.intent.payRunId,
    budgetReservationId: reservation.id,
    version: 1,
    intentDigest: fixture.intent.digest,
    policyDecisionId: decision.id,
    approvedScopeDigest: fixture.fundingScopeDigest,
    idempotencyKey: executionKey,
    source,
    requiredTarget: fixture.intent.settlementTarget,
    requestedAmount: fixture.intent.quotedAmount,
    action: fixture.scenarioId === "funding_mismatch" ? "swap_and_bridge" : "none",
    route: fixture.scenarioId === "funding_mismatch"
      ? [
          { sequence: 1, action: "swap", from: "ETH / Ethereum", to: "USDC / Ethereum", description: "Simulated source-chain conversion only", simulated: true },
          { sequence: 2, action: "bridge", from: "USDC / Ethereum", to: "USDC / Base", description: "Simulated bridge explanation only", simulated: true },
        ]
      : [],
    attempts: [{
      id: `funding_attempt_${fixture.intent.payRunId}`,
      projectId: fixture.project.id,
      payRunId: fixture.intent.payRunId,
      fundingPreparationId: id,
      executionKey,
      planDigest: fixture.fundingScopeDigest,
      outcome: "prepared",
      createdAt: occurredAt,
    }],
    status: "requested",
    planDigest: fixture.fundingScopeDigest,
    quoteReference: fixture.fundingPreflightQuote?.id ?? null,
    expiresAt: fixture.intent.expiresAt,
    transactionHash: null,
    realFundsAvailable: false,
    realBridgeCapability: false,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

export function completeSandboxFunding(
  current: FundingPreparation,
  occurredAt: string,
): FundingPreparation {
  const evidence = {
    environment: "sandbox" as const,
    kind: "sandbox_funding_evidence" as const,
    provider: "sandbox_simulated",
    reference: `sandbox:funding:${current.id}`,
    observedStatus: current.action === "none" ? "not_required" : "simulation_completed",
    checksum: sha256Canonical({ fundingPreparationId: current.id, planDigest: current.planDigest, action: current.action }),
    capturedAt: occurredAt,
    verificationMethod: "deterministic_fixture",
    synthetic: true,
    transactionHash: null,
  };
  return {
    ...current,
    version: current.version + 1,
    status: current.action === "none" ? "not_required" : "sandbox_prepared",
    attempts: current.attempts.map((attempt) => ({ ...attempt, outcome: "final_success" as const, evidence })),
    evidence,
    updatedAt: occurredAt,
  };
}
