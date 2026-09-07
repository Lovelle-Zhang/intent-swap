import { sha256Canonical } from "../adapters/storage/canonical-json";
import { evaluatePolicy } from "../domain/policy-engine";
import type {
  Agent,
  CanonicalPolicyDecision,
  LogicalSettlementTarget,
  Merchant,
  MerchantTrustState,
  PayIntent,
  PaymentQuote,
  PolicyEvaluationRequest,
  PolicyEvaluationSnapshot,
  PolicyRuleSnapshot,
  Project,
} from "../domain/types";
import { usdcToAtomic } from "./policy-form";
import { usdcMoney } from "./workspace-policy";

// 2B-intake: the pure authorization builder. Given a validated external intent,
// the workspace project id, and its stored PolicyRuleSnapshot, assemble a fully
// consistent PolicyEvaluationRequest (mirroring the sandbox fixtures) and run
// the REAL policy engine. Decision-only: nothing here funds, pays, or settles.

const USDC_TARGET: LogicalSettlementTarget = {
  kind: "logical",
  chainFamily: "base",
  asset: "USDC",
  decimals: 6,
};
const RAIL = "base";
const EFFECTIVE_FROM = "2020-01-01T00:00:00.000Z";
const INTENT_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface IntakeMerchant {
  readonly id: string;
  readonly payee: string;
  readonly category: string;
}
export interface IntakeInput {
  readonly agentId: string;
  readonly purpose: string;
  readonly amount: string;
  readonly merchant: IntakeMerchant;
  readonly artifactType: string;
  readonly idempotencyKey: string;
}
export interface IntakePolicyMeta {
  readonly version: number;
}
export interface IntakeEvaluation {
  readonly payRunId: string;
  readonly intent: PayIntent;
  readonly decision: CanonicalPolicyDecision;
  readonly rail: string;
  readonly fundingScopeDigest: string;
}

export function deterministicPayRunId(projectId: string, idempotencyKey: string): string {
  return `payrun_${sha256Canonical({ projectId, idempotencyKey }).slice(0, 20)}`;
}

export function buildIntakeEvaluation(
  input: IntakeInput,
  projectId: string,
  policyRules: PolicyRuleSnapshot,
  policyMeta: IntakePolicyMeta,
  now: string,
): IntakeEvaluation {
  const amountAtomic = usdcToAtomic(input.amount);
  if (amountAtomic === null) {
    throw new Error("Intake amount must be validated before evaluation");
  }
  const payRunId = deterministicPayRunId(projectId, input.idempotencyKey);
  const policyId = `policy_${projectId}`;
  const expiresAt = new Date(Date.parse(now) + INTENT_TTL_MS).toISOString();
  const trustState: MerchantTrustState =
    policyRules.allowedMerchantIds.includes(input.merchant.id) ? "known" : "new";
  const money = usdcMoney(amountAtomic);

  const project: Project = {
    id: projectId, projectId, version: 1, mode: "sandbox",
    killSwitchActive: false, defaultSettlementTarget: USDC_TARGET,
    createdAt: now, updatedAt: now,
  };
  const agent: Agent = {
    id: input.agentId, projectId, version: 1, ownerId: `owner_${projectId}`,
    status: "active", policyId, capabilities: ["payrun:execute"],
    createdAt: now, updatedAt: now,
  };
  const merchant: Merchant = {
    id: input.merchant.id, projectId, version: 1,
    payee: input.merchant.payee, category: input.merchant.category, trustState,
    settlementTarget: USDC_TARGET, createdAt: now, updatedAt: now,
  };
  const intentWithoutDigest = {
    id: `intent_${payRunId}`, projectId, payRunId, source: "api" as const,
    agentId: agent.id, taskId: `task_${payRunId}`, purpose: input.purpose,
    merchant: { merchantId: merchant.id, payee: merchant.payee, category: merchant.category, trustState },
    maximumAmount: money, quotedAmount: money, expectedArtifactType: input.artifactType,
    settlementTarget: USDC_TARGET, createdAt: now, expiresAt,
  };
  const intent: PayIntent = { ...intentWithoutDigest, digest: sha256Canonical(intentWithoutDigest) };
  const fundingScopeDigest = sha256Canonical({ target: USDC_TARGET, amountAtomic });

  const policySnapshot: PolicyEvaluationSnapshot = {
    projectId, policyId, policyVersion: Math.max(policyMeta.version, 1),
    policyChecksum: `sha256:${sha256Canonical(policyRules)}`,
    inputSnapshotDigest: sha256Canonical({ projectId, payRunId, rules: policyRules, amountAtomic }),
    effectiveFrom: EFFECTIVE_FROM, effectiveUntil: null, active: true, rules: policyRules,
  };
  const paymentQuote: PaymentQuote = {
    id: `quote_${payRunId}`, projectId, merchantId: merchant.id, provider: "zenfix_intake",
    rail: RAIL, amount: money, fee: usdcMoney("0"), configurationVersion: "intake-v1",
    quotedAt: now, expiresAt,
  };
  const request: PolicyEvaluationRequest = {
    decisionId: `decision_${payRunId}`, projectId, payRunId, payIntentId: intent.id,
    environment: "sandbox", actorScopes: ["payrun:execute"],
    project, agent, merchant, intent,
    evaluatedBy: { service: "zenfix_policy_engine", engineVersion: "1.0.0" },
    policySnapshot,
    budgetSnapshot: {
      projectRemaining: policyRules.absoluteHardLimit,
      agentRemaining: policyRules.absoluteHardLimit,
      merchantRemaining: policyRules.absoluteHardLimit,
    },
    paymentQuote, fundingScopeDigest, settlementTarget: USDC_TARGET, rail: RAIL, evaluatedAt: now,
  };
  return { payRunId, intent, decision: evaluatePolicy(request), rail: RAIL, fundingScopeDigest };
}
