import { describe, expect, it } from "vitest";

import {
  approvalSchema,
  evidenceReferenceSchema,
  executionProofSchema,
  fundingPreparationSchema,
  moneySchema,
  payIntentSchema,
  paymentExecutionSchema,
  policyDecisionSchema,
  policyEvaluationInputSchema,
  payRunSchema,
} from "@/features/payrun/domain/schemas";
import { SchemaValidationError } from "@/features/payrun/domain/errors";
import {
  CREATED_AT,
  EXPIRES_AT,
  OTHER_PROJECT_ID,
  PAY_RUN_ID,
  PROJECT_ID,
  UPDATED_AT,
  buildApproval,
  buildExecutionProof,
  buildFundingPreparation,
  buildIntent,
  buildPaymentExecution,
  buildPolicyDecision,
  buildPayRunAt,
  logicalTarget,
  money,
  sandboxEvidence,
} from "./fixtures";

function buildPolicyEvaluationRequest() {
  return {
    decisionId: "decision_evaluated_001",
    projectId: PROJECT_ID,
    payRunId: PAY_RUN_ID,
    payIntentId: "intent_001",
    environment: "sandbox",
    actorScopes: ["payrun:execute"],
    project: {
      id: PROJECT_ID,
      projectId: PROJECT_ID,
      version: 1,
      mode: "sandbox",
      killSwitchActive: false,
      defaultSettlementTarget: logicalTarget,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    agent: {
      id: "agent_001",
      projectId: PROJECT_ID,
      version: 1,
      ownerId: "owner_001",
      status: "active",
      policyId: "policy_001",
      capabilities: ["purchase_api"],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    merchant: {
      id: "merchant_known",
      projectId: PROJECT_ID,
      version: 1,
      payee: "api.example.test",
      category: "api",
      trustState: "known",
      settlementTarget: logicalTarget,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    intent: buildIntent(),
    evaluatedBy: {
      service: "zenfix_policy_engine",
      engineVersion: "1.0.0",
    },
    policySnapshot: {
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
    },
    budgetSnapshot: {
      projectRemaining: money("10000000"),
      agentRemaining: money("10000000"),
      merchantRemaining: money("10000000"),
    },
    paymentQuote: {
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
    },
    fundingScopeDigest: "sha256:funding-scope:001",
    settlementTarget: logicalTarget,
    rail: "sandbox",
    evaluatedAt: UPDATED_AT,
  };
}

describe("canonical runtime schemas", () => {
  it("accepts atomic-unit Money without converting it to a number", () => {
    const parsed = moneySchema.parse({
      amountAtomic: "420000",
      asset: "USDC",
      settlementRef: logicalTarget,
      decimals: 6,
    });

    expect(parsed.amountAtomic).toBe("420000");
    expect(typeof parsed.amountAtomic).toBe("string");
  });

  it.each([0.42, "0.42", "1e6", "-1", "+1", "01", " 1", "1 "])(
    "rejects non-canonical atomic amount %j",
    (amountAtomic) => {
      expect(() =>
        moneySchema.parse({
          amountAtomic,
          asset: "USDC",
          settlementRef: logicalTarget,
          decimals: 6,
        }),
      ).toThrowError(SchemaValidationError);
    },
  );

  it.each([-1, 1.5, "6", 256])("rejects invalid decimals %j", (decimals) => {
    expect(() =>
      moneySchema.parse({
        amountAtomic: "420000",
        asset: "USDC",
        settlementRef: logicalTarget,
        decimals,
      }),
    ).toThrowError(SchemaValidationError);
  });

  it.each(["id", "projectId", "version", "createdAt", "updatedAt"] as const)(
    "requires PayRun aggregate metadata field %s",
    (field) => {
      const payRun = { ...buildPayRunAt("intent_recorded") };
      delete payRun[field];
      expect(() => payRunSchema.parse(payRun)).toThrowError(SchemaValidationError);
    },
  );

  it("rejects malformed and unexpectedly extended PayIntent input", () => {
    expect(() => payIntentSchema.parse({ ...buildIntent(), expiresAt: "tomorrow" })).toThrowError(
      SchemaValidationError,
    );
    expect(() => payIntentSchema.parse({ ...buildIntent(), trustedByClient: true })).toThrowError(
      SchemaValidationError,
    );
  });

  it("requires aggregate-root metadata for mutable stage aggregates", () => {
    const funding = buildFundingPreparation();
    const { version: _version, ...withoutVersion } = funding;
    expect(() => fundingPreparationSchema.parse(withoutVersion)).toThrowError(
      SchemaValidationError,
    );

    const approval = buildApproval();
    const { updatedAt: _updatedAt, ...withoutUpdatedAt } = approval;
    expect(() => approvalSchema.parse(withoutUpdatedAt)).toThrowError(SchemaValidationError);
  });

  it("deep-freezes parsed canonical state", () => {
    const parsed = payRunSchema.parse(buildPayRunAt("completed"));

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.policyDecisions)).toBe(true);
    expect(Object.isFrozen(parsed.intent.merchant)).toBe(true);
    expect(Reflect.set(parsed, "status", "blocked")).toBe(false);
    expect(parsed.status).toBe("completed");
  });

  it("rejects a nested artifact from another project", () => {
    const payRun = buildPayRunAt("funding_prepared");
    const crossProject = {
      ...payRun,
      fundingPreparation: {
        ...payRun.fundingPreparation!,
        projectId: OTHER_PROJECT_ID,
      },
    };

    expect(() => payRunSchema.parse(crossProject)).toThrowError(SchemaValidationError);
  });

  it("rejects sandbox evidence carrying a transaction hash", () => {
    expect(() =>
      evidenceReferenceSchema.parse({
        ...sandboxEvidence("sandbox_payment_evidence"),
        transactionHash: "0xdeadbeef",
      }),
    ).toThrowError(SchemaValidationError);
  });

  it("rejects live evidence marked synthetic or using a sandbox namespace", () => {
    expect(() =>
      evidenceReferenceSchema.parse({
        ...sandboxEvidence("sandbox_payment_evidence"),
        environment: "live_guarded",
      }),
    ).toThrowError(SchemaValidationError);

    expect(() =>
      evidenceReferenceSchema.parse({
        environment: "live_guarded",
        kind: "guarded_payment_evidence",
        provider: "future_guarded_provider",
        reference: "provider:payment:001",
        observedStatus: "verified",
        checksum: "sha256:live:001",
        capturedAt: "2026-07-12T00:00:00.000Z",
        verificationMethod: "provider_signature",
        synthetic: true,
        transactionHash: "0xabc",
      }),
    ).toThrowError(SchemaValidationError);
  });

  it("accepts a server-built Policy snapshot without caller-authored checks or outcome", () => {
    const parsed = policyEvaluationInputSchema.parse(buildPolicyEvaluationRequest());

    expect(parsed.policySnapshot.policyVersion).toBe(1);
    expect(parsed.evaluatedBy.engineVersion).toBe("1.0.0");
    expect("checks" in parsed).toBe(false);
    expect("outcome" in parsed).toBe(false);
    expect("decision" in parsed).toBe(false);
  });

  it.each(["checks", "outcome", "decision"] as const)(
    "rejects caller-authored Policy result field %s",
    (field) => {
      expect(() =>
        policyEvaluationInputSchema.parse({
          ...buildPolicyEvaluationRequest(),
          [field]: field === "checks" ? [] : "allowed",
        }),
      ).toThrowError(SchemaValidationError);
    },
  );

  it("normalizes PolicyDecision into evaluator, snapshot, checks, and decision sections", () => {
    const legacy = buildPolicyDecision("allowed");
    const parsed = policyDecisionSchema.parse({
      ...legacy,
      evaluatedBy: {
        service: "zenfix_policy_engine",
        engineVersion: legacy.engineVersion,
      },
      policySnapshot: {
        projectId: legacy.projectId,
        policyId: legacy.policyId,
        policyVersion: legacy.policyVersion,
        policyChecksum: legacy.policyChecksum,
        inputSnapshotDigest: legacy.inputSnapshotDigest,
      },
      decision: {
        outcome: legacy.outcome,
        reasonCodes: legacy.reasonCodes,
        riskLevel: legacy.riskLevel,
        nextAction: legacy.nextAction,
      },
    });

    expect(parsed.evaluatedBy.service).toBe("zenfix_policy_engine");
    expect(parsed.policySnapshot.policyChecksum).toBe(legacy.policyChecksum);
    expect(parsed.checks).toEqual(legacy.checks);
    expect(parsed.decision.outcome).toBe("allowed");
  });

  it("rejects missing canonical PolicyDecision sections instead of manufacturing them", () => {
    const decision = buildPolicyDecision("allowed");
    const { evaluatedBy: _evaluatedBy, ...withoutEvaluator } = decision;
    const { policySnapshot: _policySnapshot, ...withoutSnapshot } = decision;
    const { decision: _decision, ...withoutDecision } = decision;
    expect(() => policyDecisionSchema.parse(withoutEvaluator)).toThrowError(SchemaValidationError);
    expect(() => policyDecisionSchema.parse(withoutSnapshot)).toThrowError(SchemaValidationError);
    expect(() => policyDecisionSchema.parse(withoutDecision)).toThrowError(SchemaValidationError);
  });

  it("accepts append-only FundingAttempt contract data", () => {
    const funding = buildFundingPreparation("sandbox_prepared");
    const parsed = fundingPreparationSchema.parse({
      ...funding,
      attempts: [
        {
          id: "funding_attempt_001",
          projectId: PROJECT_ID,
          payRunId: PAY_RUN_ID,
          fundingPreparationId: funding.id,
          executionKey: "funding-execution-key-001",
          planDigest: funding.planDigest,
          outcome: "final_success",
          createdAt: UPDATED_AT,
          evidence: funding.evidence,
        },
      ],
    });

    expect(parsed.attempts).toHaveLength(1);
    expect(parsed.attempts[0]?.executionKey).toBe("funding-execution-key-001");
  });

  it("requires the canonical FundingAttempt collection to be explicit", () => {
    const { attempts: _attempts, ...withoutAttempts } = buildFundingPreparation("requested");
    expect(() => fundingPreparationSchema.parse(withoutAttempts)).toThrowError(
      SchemaValidationError,
    );
  });

  it("does not allow Funding, Payment, and Execution proof evidence to substitute for each other", () => {
    expect(() =>
      fundingPreparationSchema.parse({
        ...buildFundingPreparation("sandbox_prepared"),
        evidence: sandboxEvidence("sandbox_payment_evidence"),
      }),
    ).toThrowError(SchemaValidationError);

    expect(() =>
      paymentExecutionSchema.parse({
        ...buildPaymentExecution("succeeded"),
        evidence: sandboxEvidence("sandbox_funding_evidence"),
      }),
    ).toThrowError(SchemaValidationError);

    expect(() =>
      executionProofSchema.parse({
        ...buildExecutionProof(),
        evidence: sandboxEvidence("sandbox_payment_evidence"),
      }),
    ).toThrowError(SchemaValidationError);
  });

  it("requires PaymentInstruction to bind its FundingPreparation identity", () => {
    const payment = buildPaymentExecution("prepared");
    const { fundingPreparationId: _fundingPreparationId, ...withoutFunding } =
      payment.instruction as typeof payment.instruction & { fundingPreparationId?: string };
    expect(() =>
      paymentExecutionSchema.parse({ ...payment, instruction: withoutFunding }),
    ).toThrowError(SchemaValidationError);
  });

  it("projects artifact proof separately from payment and execution evidence", () => {
    const proof = buildExecutionProof();
    const parsed = executionProofSchema.parse(proof) as ReturnType<
      typeof executionProofSchema.parse
    > & {
      artifactProof: {
        artifactType: string;
        artifactReference: string;
        checksum: string;
      };
    };

    expect(parsed.artifactProof).toMatchObject({
      artifactType: proof.artifactType,
      artifactReference: proof.artifactReference,
      checksum: proof.checksum,
    });
    expect(parsed.artifactProof).not.toHaveProperty("transactionHash");
  });

  it("returns structured safeParse failures without manufacturing defaults", () => {
    const result = payRunSchema.safeParse({ projectId: "project_only" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(SchemaValidationError);
    }
  });
});
