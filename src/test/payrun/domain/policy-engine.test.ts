import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "@/features/payrun/domain/policy-engine";
import { InvariantViolationError, IntentExpiredError } from "@/features/payrun/domain/errors";
import type {
  Agent,
  Merchant,
  PaymentQuote,
  PolicyEvaluationRequest,
  PolicyEvaluationSnapshot,
  Project,
  FundingPreflightQuote,
} from "@/features/payrun/domain/types";
import {
  CREATED_AT,
  EXPIRES_AT,
  PAY_RUN_ID,
  PROJECT_ID,
  UPDATED_AT,
  buildApproval,
  buildIntent,
  logicalTarget,
  money,
} from "./fixtures";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    projectId: PROJECT_ID,
    version: 1,
    mode: "sandbox",
    killSwitchActive: false,
    defaultSettlementTarget: logicalTarget,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent_001",
    projectId: PROJECT_ID,
    version: 1,
    ownerId: "owner_001",
    status: "active",
    policyId: "policy_001",
    capabilities: ["purchase_api"],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function merchant(overrides: Partial<Merchant> = {}): Merchant {
  return {
    id: "merchant_known",
    projectId: PROJECT_ID,
    version: 1,
    payee: "api.example.test",
    category: "api",
    trustState: "known",
    settlementTarget: logicalTarget,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function policySnapshot(
  overrides: Partial<PolicyEvaluationSnapshot> = {},
): PolicyEvaluationSnapshot {
  return {
    projectId: PROJECT_ID,
    policyId: "policy_001",
    policyVersion: 1,
    policyChecksum: "sha256:policy:001",
    inputSnapshotDigest: "sha256:policy-input:001",
    effectiveFrom: CREATED_AT,
    effectiveUntil: EXPIRES_AT,
    active: true,
    rules: {
      allowedMerchantIds: ["merchant_known"],
      blockedMerchantIds: [],
      blockedCategories: [],
      allowedRails: ["sandbox"],
      transactionLimit: money("1000000"),
      absoluteHardLimit: money("10000000"),
      reviewThreshold: money("1000000"),
      requireReviewForNewMerchant: true,
      allowedArtifactTypes: ["api_result"],
    },
    ...overrides,
  };
}

function paymentQuote(overrides: Partial<PaymentQuote> = {}): PaymentQuote {
  return {
    id: "payment_quote_001",
    projectId: PROJECT_ID,
    merchantId: "merchant_known",
    provider: "sandbox_quote_provider",
    rail: "sandbox",
    amount: money("420000"),
    fee: money("0"),
    configurationVersion: "sandbox-v1",
    quotedAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function fundingQuote(
  overrides: Partial<FundingPreflightQuote> = {},
): FundingPreflightQuote {
  return {
    id: "funding_quote_001",
    projectId: PROJECT_ID,
    planDigest: "sha256:funding-scope:001",
    provider: "sandbox_read_only_quote",
    source: {
      chainFamily: "ethereum",
      asset: "ETH",
      accountRef: "sandbox:source:001",
      amountAtomic: "1000000000000000",
      decimals: 18,
    },
    target: logicalTarget,
    requestedAmount: money("420000"),
    estimatedFee: money("1000"),
    configurationVersion: "sandbox-v1",
    quotedAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    readOnly: true,
    ...overrides,
  };
}

function baseInput(overrides: Partial<PolicyEvaluationRequest> = {}): PolicyEvaluationRequest {
  return {
    decisionId: "decision_evaluated_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    payIntentId: "intent_001",
    environment: "sandbox",
    actorScopes: ["payrun:execute"],
    project: project(),
    agent: agent(),
    merchant: merchant(),
    intent: buildIntent(),
    evaluatedBy: { service: "zenfix_policy_engine", engineVersion: "1.0.0" },
    policySnapshot: policySnapshot(),
    budgetSnapshot: {
      projectRemaining: money("10000000"),
      agentRemaining: money("10000000"),
      merchantRemaining: money("10000000"),
    },
    paymentQuote: paymentQuote(),
    fundingScopeDigest: "sha256:funding-scope:001",
    settlementTarget: logicalTarget,
    rail: "sandbox",
    evaluatedAt: UPDATED_AT,
    ...overrides,
  };
}

function thresholdPolicy(): PolicyEvaluationSnapshot {
  const baseline = policySnapshot();
  return {
    ...baseline,
    rules: { ...baseline.rules, reviewThreshold: money("400000") },
  };
}

describe("deterministic Policy Engine", () => {
  it("derives stable ordered checks from an authoritative snapshot", () => {
    const input = baseInput();
    const first = evaluatePolicy(input);
    const replay = evaluatePolicy(structuredClone(input));

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      outcome: "allowed",
      nextAction: "prepare_funding",
      reasonCodes: [],
      evaluatedBy: input.evaluatedBy,
      policySnapshot: {
        projectId: PROJECT_ID,
        policyId: "policy_001",
        policyVersion: 1,
      },
    });
    expect(first.checks.map((check) => check.ruleClass)).toEqual([
      "structural",
      "structural",
      "emergency",
      "identity",
      "identity",
      "identity",
      "payee",
      "payee",
      "settlement",
      "settlement",
      "settlement",
      "settlement",
      "hard_limit",
      "hard_limit",
      "hard_limit",
      "hard_limit",
      "hard_limit",
      "review",
      "evidence",
    ]);
  });

  it("gives hard blocks precedence over review", () => {
    const decision = evaluatePolicy(
      baseInput({
        project: project({ killSwitchActive: true }),
        policySnapshot: thresholdPolicy(),
      }),
    );

    expect(decision.outcome).toBe("blocked");
    expect(decision.reasonCodes).toContain("execution.kill_switch_active");
    expect(decision.reasonCodes).not.toContain("approval.threshold_reached");
  });

  it("returns needs_review for an uncovered deterministic review rule", () => {
    const decision = evaluatePolicy(baseInput({ policySnapshot: thresholdPolicy() }));
    expect(decision.outcome).toBe("needs_review");
    expect(decision.reasonCodes).toEqual(["approval.threshold_reached"]);
  });

  it("consumes only unchanged Approval-covered reasons", () => {
    const approval = buildApproval("approved");
    const decision = evaluatePolicy(
      baseInput({
        policySnapshot: thresholdPolicy(),
        approval,
        recheckContext: {
          approvalDecisionId: approval.decision!.id,
          approvedScopeDigest: approval.request.approvalScopeDigest,
          coveredReasonCodes: approval.request.coveredReasonCodes,
        },
      }),
    );

    expect(decision.outcome).toBe("allowed");
    expect(decision.authorizationBasisApprovalDecisionId).toBe(approval.decision!.id);
    expect(
      decision.checks.find((check) => check.reasonCode === "approval.threshold_reached"),
    ).toMatchObject({ outcome: "pass", satisfiedByApprovalDecisionId: approval.decision!.id });
  });

  it("returns to review for a new uncovered reason after Approval", () => {
    const approval = buildApproval("approved");
    const changedMerchant = merchant({ trustState: "new" });
    const decision = evaluatePolicy(
      baseInput({
        policySnapshot: thresholdPolicy(),
        merchant: changedMerchant,
        intent: buildIntent({
          merchant: { ...buildIntent().merchant, trustState: "new" },
        }),
        approval,
        recheckContext: {
          approvalDecisionId: approval.decision!.id,
          approvedScopeDigest: approval.request.approvalScopeDigest,
          coveredReasonCodes: approval.request.coveredReasonCodes,
        },
      }),
    );
    expect(decision.outcome).toBe("needs_review");
    expect(decision.reasonCodes).toEqual(["merchant.new_requires_review"]);
  });

  it("never lets Approval override a new hard block", () => {
    const approval = buildApproval("approved");
    const decision = evaluatePolicy(
      baseInput({
        project: project({ killSwitchActive: true }),
        policySnapshot: thresholdPolicy(),
        approval,
        recheckContext: {
          approvalDecisionId: approval.decision!.id,
          approvedScopeDigest: approval.request.approvalScopeDigest,
          coveredReasonCodes: approval.request.coveredReasonCodes,
        },
      }),
    );
    expect(decision.outcome).toBe("blocked");
  });

  it("fails closed when any Approval-bound field changes", () => {
    const approval = buildApproval("approved");
    const context = {
      approval,
      recheckContext: {
        approvalDecisionId: approval.decision!.id,
        approvedScopeDigest: approval.request.approvalScopeDigest,
        coveredReasonCodes: approval.request.coveredReasonCodes,
      },
    };

    expect(() =>
      evaluatePolicy(baseInput({ ...context, fundingScopeDigest: "sha256:changed" })),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      evaluatePolicy(baseInput({ ...context, rail: "changed" })),
    ).toThrowError(InvariantViolationError);
  });

  it("fails closed for expired Approval or missing authoritative input", () => {
    const baseline = buildApproval("approved");
    const expired = buildApproval("approved", {
      request: { ...baseline.request, expiresAt: UPDATED_AT },
    });
    expect(() =>
      evaluatePolicy(
        baseInput({
          policySnapshot: thresholdPolicy(),
          approval: expired,
          recheckContext: {
            approvalDecisionId: expired.decision!.id,
            approvedScopeDigest: expired.request.approvalScopeDigest,
            coveredReasonCodes: expired.request.coveredReasonCodes,
          },
        }),
      ),
    ).toThrowError(IntentExpiredError);
    expect(() =>
      evaluatePolicy({ ...baseInput(), merchant: undefined } as unknown as PolicyEvaluationRequest),
    ).toThrowError(InvariantViolationError);
  });

  it("rejects floating point amounts instead of comparing them", () => {
    const intent = buildIntent({
      quotedAmount: { ...money(), amountAtomic: 0.42 } as unknown as ReturnType<typeof money>,
    });
    expect(() => evaluatePolicy(baseInput({ intent }))).toThrowError(InvariantViolationError);
  });

  it("requires and binds a current read-only Funding preflight quote for asset mismatch", () => {
    const intent = buildIntent({
      requestedFundingSource: fundingQuote().source,
    });
    expect(() => evaluatePolicy(baseInput({ intent }))).toThrowError(InvariantViolationError);
    expect(() =>
      evaluatePolicy(
        baseInput({
          intent,
          fundingPreflightQuote: fundingQuote({
            requestedAmount: money("1"),
          }),
        }),
      ),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      evaluatePolicy(
        baseInput({
          intent,
          fundingPreflightQuote: fundingQuote({ expiresAt: UPDATED_AT }),
        }),
      ),
    ).toThrowError(InvariantViolationError);
    expect(evaluatePolicy(baseInput({ intent, fundingPreflightQuote: fundingQuote() })).outcome).toBe(
      "allowed",
    );
  });
});
