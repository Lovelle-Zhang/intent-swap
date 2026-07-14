import { describe, expect, it } from "vitest";

import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import {
  filterPilotScenarios,
  getLifecycleStages,
  getPilotMetrics,
  getPolicyHealth,
  getPrimaryStatus,
} from "@/features/payrun/presentation/pilot-session";
import type { PilotSessionView } from "@/features/payrun/pilot/session-contracts";

function sessionFixture(): PilotSessionView {
  const scenario = (
    name: "allowed" | "needs_review" | "blocked" | "funding_mismatch",
    status: "completed" | "pending_review" | "blocked",
    amountAtomic: string,
  ) => ({
    name,
    payRunId: `payrun_${name}`,
    actualFinalStatus: status,
    agent: { id: "agent_sandbox_001", name: null, ownerId: null },
    purpose: "Purchase a verified API result",
    createdAt: "2026-07-13T10:00:00.000Z",
    amount: { amountAtomic, asset: "USDC", decimals: 6 },
    explanation: {
      projectId: "project_zenfix_sandbox",
      payRunId: `payrun_${name}`,
      payRunVersion: 1,
      environment: "sandbox" as const,
      canonicalStatus: status,
      merchant: { merchantId: "merchant", payee: "merchant.example.test" },
      amountAtomic,
      policy: {
        outcome: name === "blocked" ? "blocked" as const : name === "needs_review" ? "needs_review" as const : "allowed" as const,
        policyId: "policy_sandbox_pilot_v1",
        policyVersion: 1,
        reasonCodes: [],
      },
      reservation: status === "completed" ? { status: "consumed" as const, id: `reservation_${name}` } : null,
      funding: {
        status: status === "completed" ? (name === "funding_mismatch" ? "sandbox_prepared" : "not_required") : null,
        action: status === "completed" ? (name === "funding_mismatch" ? "swap_and_bridge" : "none") : null,
        displayLabel: status === "completed" ? "Funding not required" : "Not available",
      },
      paymentStatus: status === "completed" ? "succeeded" : null,
      proofStatus: status === "completed" ? "verified" : null,
      ledgerJournalId: status === "completed" ? `ledger_${name}` : null,
      nextAction: status === "pending_review" ? "human_review_required" as const : status === "blocked" ? "stop" as const : "none" as const,
      canonicalReceiptAvailable: false as const,
      realFundsMoved: false as const,
      watermark: "SANDBOX / NO REAL FUNDS" as const,
    },
    validationReceipt: {
      projectId: "project_zenfix_sandbox",
      payRunId: `payrun_${name}`,
      payRunVersion: 1,
      environment: "sandbox" as const,
      canonicalStatus: status,
      merchant: { merchantId: "merchant", payee: "merchant.example.test" },
      amountAtomic,
      policy: { outcome: null, policyId: null, policyVersion: null, reasonCodes: [] },
      reservation: null,
      funding: { status: null, action: null, displayLabel: "Not available" },
      paymentStatus: null,
      proofStatus: null,
      ledgerJournalId: null,
      nextAction: "none" as const,
      canonicalReceiptAvailable: false as const,
      realFundsMoved: false as const,
      watermark: "SANDBOX / NO REAL FUNDS" as const,
      projectionKind: "validation_receipt" as const,
    },
    policy: {
      outcome: name === "blocked" ? "blocked" as const : name === "needs_review" ? "needs_review" as const : "allowed" as const,
      policyId: "policy_sandbox_pilot_v1",
      policyVersion: 1,
      reasonCodes: [],
      checks: [
        { sequence: 1, ruleClass: "identity", reasonCode: "agent.active", outcome: "pass", explanation: "Agent active." },
        { sequence: 2, ruleClass: "evidence", reasonCode: "artifact.proof_required", outcome: "pass", explanation: "Proof required." },
        ...(name === "needs_review" ? [{ sequence: 3, ruleClass: "review", reasonCode: "merchant.new_requires_review", outcome: "review", explanation: "Review." }] : []),
        ...(name === "blocked" ? [{ sequence: 3, ruleClass: "payee", reasonCode: "merchant.unknown", outcome: "block", explanation: "Blocked." }] : []),
      ],
    },
    approval: status === "pending_review" ? { status: "pending", requestId: "approval_request" } : null,
    funding: status === "completed" ? { status: name === "funding_mismatch" ? "sandbox_prepared" : "not_required", reference: null, synthetic: true, transactionHash: null } : null,
    payment: status === "completed" ? { status: "succeeded", reference: "payment_ref", synthetic: true, transactionHash: null } : null,
    proof: status === "completed" ? { status: "verified", reference: "proof_ref", synthetic: true, transactionHash: null } : null,
    ledger: status === "completed" ? { journalId: `ledger_${name}`, balanced: true as const } : null,
    audit: [],
  });

  return {
    sessionId: "20260714T042411.375Z-4b053a0",
    createdAt: "2026-07-14T04:24:11.375Z",
    sourceCommit: "4b053a0523bdf8026888feb0c2d2ca70bf948f96",
    storeGeneration: 28,
    storeEnvelopeChecksum: "checksum",
    manifestChecksum: "manifest",
    preparationCommandVersion: "pv1-prepare-v1",
    sandboxOnly: true,
    watermark: "SANDBOX / NO REAL FUNDS",
    scenarios: [
      scenario("allowed", "completed", "420000"),
      scenario("needs_review", "pending_review", "440000"),
      scenario("blocked", "blocked", "8000000"),
      scenario("funding_mismatch", "completed", "420000"),
    ],
  };
}

describe("read-only money formatting", () => {
  it("formats canonical atomic amounts using decimals without floating point", () => {
    expect(formatAtomicMoney({ amountAtomic: "420000", decimals: 6, asset: "USDC" })).toBe("0.42 USDC");
    expect(formatAtomicMoney({ amountAtomic: "440000", decimals: 6, asset: "USDC" })).toBe("0.44 USDC");
    expect(formatAtomicMoney({ amountAtomic: "8000000", decimals: 6, asset: "USDC" })).toBe("8 USDC");
    expect(formatAtomicMoney({ amountAtomic: "1000000000000000001", decimals: 18, asset: "ETH" })).toBe("1.000000000000000001 ETH");
  });

  it("rejects non-canonical inputs", () => {
    expect(() => formatAtomicMoney({ amountAtomic: "0.42", decimals: 6, asset: "USDC" })).toThrow();
    expect(() => formatAtomicMoney({ amountAtomic: "-1", decimals: 6, asset: "USDC" })).toThrow();
    expect(() => formatAtomicMoney({ amountAtomic: "1", decimals: -1, asset: "USDC" })).toThrow();
  });
});

describe("Pilot Session presentation projections", () => {
  const session = sessionFixture();

  it("derives canonical dashboard metrics and controlled spend", () => {
    expect(getPilotMetrics(session)).toEqual({
      total: 4,
      completed: 2,
      needsReview: 1,
      blocked: 1,
      controlledSpend: { amountAtomic: "840000", decimals: 6, asset: "USDC" },
    });
  });

  it("aggregates Policy outcomes and evidence checks without inventing a score", () => {
    expect(getPolicyHealth(session)).toEqual({
      passed: 8,
      review: 1,
      blocked: 1,
      evidencePassed: 4,
      evidenceTotal: 4,
    });
  });

  it("maps lifecycle nodes for completed, review, and blocked scenarios", () => {
    expect(getLifecycleStages(session.scenarios[0]!).map((stage) => stage.status)).toEqual([
      "completed", "completed", "not-applicable", "completed", "completed", "completed", "completed",
    ]);
    expect(getLifecycleStages(session.scenarios[1]!).map((stage) => stage.status)).toEqual([
      "completed", "completed", "pending", "not-applicable", "not-applicable", "not-applicable", "not-applicable",
    ]);
    expect(getLifecycleStages(session.scenarios[2]!).map((stage) => stage.status)).toEqual([
      "completed", "blocked", "not-applicable", "not-applicable", "not-applicable", "not-applicable", "not-applicable",
    ]);
  });

  it("uses the frozen product status language and URL-query filters", () => {
    expect(session.scenarios.map(getPrimaryStatus)).toEqual(["Completed", "Needs Review", "Blocked", "Completed"]);
    expect(filterPilotScenarios(session.scenarios, { status: "completed" })).toHaveLength(2);
    expect(filterPilotScenarios(session.scenarios, { scenario: "blocked" })).toHaveLength(1);
    expect(filterPilotScenarios(session.scenarios, { status: "invalid" })).toEqual([]);
  });
});

