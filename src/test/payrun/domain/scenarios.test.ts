import { describe, expect, it } from "vitest";

import {
  createPayRun,
  transitionPayRun,
} from "@/features/payrun/domain/state-machine";
import { resolveIdempotency } from "@/features/payrun/domain/invariants";
import type {
  PayRun,
  PayRunStatus,
  PayRunTransitionCommand,
} from "@/features/payrun/domain/types";
import {
  CREATED_AT,
  PAY_RUN_ID,
  PROJECT_ID,
  buildFundingPreparation,
  buildIntent,
  buildTransitionCommand,
} from "./fixtures";

function createScenarioPayRun(intent = buildIntent()): PayRun {
  return createPayRun({
    payRunId: PAY_RUN_ID,
    projectId: PROJECT_ID,
    environment: "sandbox",
    intent,
    createdAt: CREATED_AT,
    creationIdempotencyKey: "scenario-create-001",
    requestHash: "sha256:scenario-create-001",
    idempotencyRetentionUntil: "2027-07-12T00:00:00.000Z",
    idempotencyRecordId: "idempotency_scenario_create_001",
    auditEventId: "audit_scenario_create_001",
    outboxEventId: "outbox_scenario_create_001",
    correlationId: "correlation_scenario_create_001",
    actor: { actorId: "agent_001", actorType: "agent" },
  }).payRun;
}

function advance(
  current: PayRun,
  to: PayRunStatus,
  overrides: Partial<PayRunTransitionCommand> = {},
) {
  return transitionPayRun(current, buildTransitionCommand(current, to, overrides));
}

function runTrace(
  initial: PayRun,
  states: readonly PayRunStatus[],
): { payRun: PayRun; observed: PayRunStatus[] } {
  let payRun = initial;
  const observed: PayRunStatus[] = [initial.status];
  for (const state of states) {
    payRun = advance(payRun, state).payRun;
    observed.push(payRun.status);
  }
  return { payRun, observed };
}

const completedTail = [
  "funding_preparing",
  "funding_prepared",
  "payment_executing",
  "payment_succeeded",
  "proof_collecting",
  "proof_collected",
  "ledger_recording",
  "completed",
] as const satisfies readonly PayRunStatus[];

describe("canonical pilot scenario traces", () => {
  it("Allowed follows the complete lifecycle with no Approval", () => {
    const { payRun, observed } = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "policy_allowed",
      ...completedTail,
    ]);

    expect(observed).toEqual([
      "intent_recorded",
      "policy_evaluating",
      "policy_allowed",
      "funding_preparing",
      "funding_prepared",
      "payment_executing",
      "payment_succeeded",
      "proof_collecting",
      "proof_collected",
      "ledger_recording",
      "completed",
    ]);
    expect(payRun.approval).toBeUndefined();
    expect(payRun.fundingPreparation?.status).toBe("not_required");
    expect(payRun.paymentExecution?.status).toBe("succeeded");
    expect(payRun.executionProof?.verificationStatus).toBe("verified");
    expect(payRun.ledgerJournal).toBeDefined();
  });

  it("Needs Review stops with no downstream artifact until a human decision", () => {
    const { payRun, observed } = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "pending_review",
    ]);

    expect(observed).toEqual([
      "intent_recorded",
      "policy_evaluating",
      "pending_review",
    ]);
    expect(payRun.approval?.status).toBe("pending");
    expect(payRun.fundingPreparation).toBeUndefined();
    expect(payRun.paymentExecution).toBeUndefined();
    expect(payRun.executionProof).toBeUndefined();
    expect(payRun.ledgerJournal).toBeUndefined();
  });

  it("Review approve path rechecks Policy before Funding and then completes", () => {
    const pending = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "pending_review",
    ]).payRun;
    const approved = advance(pending, "approved").payRun;
    const evaluating = advance(approved, "policy_evaluating").payRun;
    const allowed = advance(evaluating, "policy_allowed").payRun;
    const { payRun, observed } = runTrace(allowed, completedTail);

    expect([
      "pending_review",
      approved.status,
      evaluating.status,
      allowed.status,
      ...observed.slice(1),
    ]).toEqual([
      "pending_review",
      "approved",
      "policy_evaluating",
      "policy_allowed",
      "funding_preparing",
      "funding_prepared",
      "payment_executing",
      "payment_succeeded",
      "proof_collecting",
      "proof_collected",
      "ledger_recording",
      "completed",
    ]);
    expect(evaluating.policyEvaluation?.recheckContext).toMatchObject({
      approvalDecisionId: approved.approval?.decision?.id,
    });
    expect(allowed.policyDecisions.at(-1)?.authorizationBasisApprovalDecisionId).toBe(
      approved.approval?.decision?.id,
    );
    expect(payRun.status).toBe("completed");
  });

  it("Review reject path terminates with no downstream artifact", () => {
    const pending = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "pending_review",
    ]).payRun;
    const denied = advance(pending, "denied").payRun;

    expect(denied.status).toBe("denied");
    expect(denied.approval?.decision?.outcome).toBe("denied");
    expect(denied.fundingPreparation).toBeUndefined();
    expect(denied.paymentExecution).toBeUndefined();
    expect(denied.executionProof).toBeUndefined();
    expect(denied.ledgerJournal).toBeUndefined();
  });

  it("Blocked terminates after Policy with no Approval or downstream artifact", () => {
    const { payRun, observed } = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "blocked",
    ]);

    expect(observed).toEqual(["intent_recorded", "policy_evaluating", "blocked"]);
    expect(payRun.policyDecisions.at(-1)?.reasonCodes).toEqual(["merchant.unknown"]);
    expect(payRun.approval).toBeUndefined();
    expect(payRun.fundingPreparation).toBeUndefined();
    expect(payRun.paymentExecution).toBeUndefined();
    expect(payRun.executionProof).toBeUndefined();
    expect(payRun.ledgerJournal).toBeUndefined();
  });

  it("Funding Mismatch records explicit Sandbox simulation then completes", () => {
    const allowed = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "policy_allowed",
      "funding_preparing",
    ]).payRun;
    const mismatchFunding = buildFundingPreparation("sandbox_prepared", {
      source: {
        chainFamily: "ethereum",
        asset: "ETH",
        accountRef: "sandbox:synthetic-source:eth",
        amountAtomic: "1000000000000000",
        decimals: 18,
      },
      action: "swap_and_bridge",
      route: [
        {
          sequence: 1,
          action: "swap",
          from: "ETH/Ethereum",
          to: "USDC/Ethereum",
          description: "Simulated source-chain conversion",
          simulated: true,
        },
        {
          sequence: 2,
          action: "bridge",
          from: "USDC/Ethereum",
          to: "USDC/Base",
          description: "Simulated bridge intent",
          simulated: true,
        },
      ],
      transactionHash: null,
      realFundsAvailable: false,
      realBridgeCapability: false,
    });
    const prepared = advance(allowed, "funding_prepared", {
      data: { fundingPreparation: mismatchFunding },
    }).payRun;
    const { payRun, observed } = runTrace(prepared, [
      "payment_executing",
      "payment_succeeded",
      "proof_collecting",
      "proof_collected",
      "ledger_recording",
      "completed",
    ]);

    expect(["funding_prepared", ...observed.slice(1)]).toEqual([
      "funding_prepared",
      "payment_executing",
      "payment_succeeded",
      "proof_collecting",
      "proof_collected",
      "ledger_recording",
      "completed",
    ]);
    expect(payRun.fundingPreparation).toMatchObject({
      status: "sandbox_prepared",
      action: "swap_and_bridge",
      transactionHash: null,
      realFundsAvailable: false,
      realBridgeCapability: false,
    });
    expect(payRun.fundingPreparation?.evidence?.environment).toBe("sandbox");
    expect(payRun.fundingPreparation?.evidence?.synthetic).toBe(true);
    expect(payRun.paymentExecution?.evidence?.environment).toBe("sandbox");
    expect(payRun.executionProof?.evidence.environment).toBe("sandbox");
    expect(payRun.ledgerJournal?.environment).toBe("sandbox");
  });

  it("maps a duplicate callback idempotency scope to one logical proof transition", () => {
    const collecting = runTrace(createScenarioPayRun(), [
      "policy_evaluating",
      "policy_allowed",
      "funding_preparing",
      "funding_prepared",
      "payment_executing",
      "payment_succeeded",
      "proof_collecting",
    ]).payRun;
    const first = advance(collecting, "proof_collected");
    const replay = resolveIdempotency(first.idempotencyRecord, {
      projectId: first.idempotencyRecord.projectId,
      commandType: first.idempotencyRecord.commandType,
      key: first.idempotencyRecord.key,
      requestHash: first.idempotencyRecord.requestHash,
      commandAt: first.idempotencyRecord.updatedAt,
    });

    expect(replay).toEqual({ kind: "replay", record: first.idempotencyRecord });
    expect(first.payRun.executionProof?.id).toBe("proof_001");
    expect(first.payRun.ledgerJournal).toBeUndefined();
  });
});
