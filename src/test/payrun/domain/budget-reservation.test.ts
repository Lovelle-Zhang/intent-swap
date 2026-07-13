import { describe, expect, it } from "vitest";

import {
  activateBudgetReservation,
  consumeBudgetReservation,
  releaseBudgetReservation,
} from "@/features/payrun/domain/budget-reservation";
import { InvariantViolationError, VersionConflictError } from "@/features/payrun/domain/errors";
import { budgetReservationSchema } from "@/features/payrun/domain/schemas";
import type { BudgetReservation } from "@/features/payrun/domain/types";
import { EXPIRES_AT, PAY_RUN_ID, PROJECT_ID, UPDATED_AT, money } from "./fixtures";

function input(): Omit<BudgetReservation, "version" | "status" | "createdAt" | "updatedAt"> {
  return {
    id: "reservation_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    agentId: "agent_001",
    merchantId: "merchant_known",
    rail: "sandbox",
    scopeGeneration: 1,
    policyDecisionId: "decision_allowed_001",
    policyId: "policy_001",
    policyVersion: 1,
    policyChecksum: "sha256:policy:001",
    policyEvaluationDigest: "sha256:input:allowed",
    intentDigest: "sha256:intent:001",
    approvalScopeDigest: null,
    approvalDecisionId: null,
    fundingScopeDigest: "sha256:funding-scope:001",
    budgetKeys: ["project:project_zenfix_test", "agent:agent_001", "merchant:merchant_known"],
    reservedAmount: money("420000"),
    environment: "sandbox",
    expiresAt: EXPIRES_AT,
    terminalReasonCode: null,
    terminalEvidence: null,
  };
}

describe("BudgetReservation", () => {
  it("activates one immutable versioned reservation", () => {
    const reservation = activateBudgetReservation(input(), UPDATED_AT);

    expect(reservation.status).toBe("active");
    expect(reservation.version).toBe(1);
    expect(budgetReservationSchema.parse(reservation)).toEqual(reservation);
    expect(Object.isFrozen(reservation)).toBe(true);
  });

  it("releases only an active reservation with explicit evidence", () => {
    const active = activateBudgetReservation(input(), UPDATED_AT);
    const released = releaseBudgetReservation(active, {
      expectedVersion: 1,
      occurredAt: "2026-07-12T00:03:00.000Z",
      reasonCode: "funding.authoritative_no_effect",
      evidence: {
        environment: "sandbox",
        kind: "sandbox_safe_release_evidence",
        provider: "sandbox_simulated",
        reference: "sandbox:release:001",
        observedStatus: "verified",
        checksum: "sha256:release:001",
        capturedAt: "2026-07-12T00:03:00.000Z",
        verificationMethod: "deterministic_fixture",
        synthetic: true,
        transactionHash: null,
      },
    });

    expect(released).toMatchObject({ status: "released", version: 2 });
    expect(released.terminalReasonCode).toBe("funding.authoritative_no_effect");
  });

  it("consumes once and rejects stale or terminal mutation", () => {
    const active = activateBudgetReservation(input(), UPDATED_AT);
    const consumed = consumeBudgetReservation(active, {
      expectedVersion: 1,
      occurredAt: "2026-07-12T00:04:00.000Z",
      reasonCode: "ledger.committed",
      ledgerJournalId: "ledger_journal_001",
    });

    expect(consumed).toMatchObject({ status: "consumed", version: 2 });
    expect(consumed.terminalEvidence).toEqual({ ledgerJournalId: "ledger_journal_001" });
    expect(() => consumeBudgetReservation(consumed, {
      expectedVersion: 1,
      occurredAt: "2026-07-12T00:05:00.000Z",
      reasonCode: "ledger.committed",
      ledgerJournalId: "ledger_journal_001",
    })).toThrow(VersionConflictError);
    expect(() => consumeBudgetReservation(consumed, {
      expectedVersion: 2,
      occurredAt: "2026-07-12T00:05:00.000Z",
      reasonCode: "ledger.committed",
      ledgerJournalId: "ledger_journal_001",
    })).toThrow(InvariantViolationError);
  });

  it("rejects non-canonical reserved money", () => {
    expect(() => activateBudgetReservation({
      ...input(),
      reservedAmount: money("0.42"),
    }, UPDATED_AT)).toThrow(InvariantViolationError);
  });
});
