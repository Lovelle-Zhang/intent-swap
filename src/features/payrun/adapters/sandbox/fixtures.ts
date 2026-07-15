import { sha256Canonical } from "../storage/canonical-json";
import { InvariantViolationError } from "../../domain/errors";
import type { SandboxScenarioId } from "../../application/control-loop-commands";
import type {
  Agent,
  FundingPreflightQuote,
  LogicalSettlementTarget,
  Merchant,
  Money,
  PayIntent,
  PaymentQuote,
  PolicyEvaluationRequest,
  PolicyEvaluationSnapshot,
  Project,
} from "../../domain/types";

export const SANDBOX_PROJECT_ID = "project_zenfix_sandbox";
export const SANDBOX_POLICY_ID = "policy_sandbox_pilot_v1";
export const SANDBOX_RAIL = "sandbox_simulated";
export const SANDBOX_CREATED_AT = "2026-07-13T10:00:00.000Z";
export const SANDBOX_EXPIRES_AT = "2026-07-14T10:00:00.000Z";

export const sandboxTarget: LogicalSettlementTarget = {
  kind: "logical",
  chainFamily: "base",
  asset: "USDC",
  decimals: 6,
};

export function sandboxMoney(amountAtomic: string): Money {
  return { amountAtomic, asset: "USDC", settlementRef: sandboxTarget, decimals: 6 };
}

export interface SandboxScenarioFixture {
  readonly scenarioId: SandboxScenarioId;
  readonly project: Project;
  readonly agent: Agent;
  readonly merchant: Merchant;
  readonly intent: PayIntent;
  readonly policySnapshot: PolicyEvaluationSnapshot;
  readonly paymentQuote: PaymentQuote;
  readonly fundingPreflightQuote?: FundingPreflightQuote;
  readonly fundingScopeDigest: string;
}

export interface HostedSandboxProjectBinding {
  readonly projectId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function bindHostedSandboxProject(projectId: string): HostedSandboxProjectBinding {
  if (!UUID_PATTERN.test(projectId)) {
    throw new InvariantViolationError("Hosted Sandbox Project must use a canonical UUID");
  }
  return Object.freeze({ projectId });
}

export function deterministicPayRunId(projectId: string, idempotencyKey: string): string {
  return `payrun_${sha256Canonical({ projectId, idempotencyKey }).slice(0, 20)}`;
}

export function buildSandboxScenarioFixture(
  projectId: string,
  payRunId: string,
  scenarioId: SandboxScenarioId,
): SandboxScenarioFixture {
  if (projectId !== SANDBOX_PROJECT_ID) {
    throw new InvariantViolationError("Unknown Sandbox Project");
  }
  return buildProjectSandboxScenarioFixture(projectId, payRunId, scenarioId);
}

export function buildHostedSandboxScenarioFixture(
  binding: HostedSandboxProjectBinding,
  projectId: string,
  payRunId: string,
  scenarioId: SandboxScenarioId,
): SandboxScenarioFixture {
  if (projectId !== binding.projectId) {
    throw new InvariantViolationError("Unknown Hosted Sandbox Project");
  }
  return buildProjectSandboxScenarioFixture(projectId, payRunId, scenarioId);
}

function buildProjectSandboxScenarioFixture(
  projectId: string,
  payRunId: string,
  scenarioId: SandboxScenarioId,
): SandboxScenarioFixture {
  const amountAtomic = scenarioId === "needs_review" ? "440000" : scenarioId === "blocked" ? "8000000" : "420000";
  const merchantId = scenarioId === "needs_review"
    ? "merchant_new"
    : scenarioId === "blocked"
      ? "merchant_unknown"
      : "merchant_known";
  const trustState = scenarioId === "needs_review" ? "new" : scenarioId === "blocked" ? "unknown" : "known";
  const project: Project = {
    id: projectId,
    projectId,
    version: 1,
    mode: "sandbox",
    killSwitchActive: false,
    defaultSettlementTarget: sandboxTarget,
    createdAt: SANDBOX_CREATED_AT,
    updatedAt: SANDBOX_CREATED_AT,
  };
  const agent: Agent = {
    id: "agent_sandbox_001",
    projectId,
    version: 1,
    ownerId: "sandbox_agent_owner",
    status: "active",
    policyId: SANDBOX_POLICY_ID,
    capabilities: ["payrun:execute"],
    createdAt: SANDBOX_CREATED_AT,
    updatedAt: SANDBOX_CREATED_AT,
  };
  const merchant: Merchant = {
    id: merchantId,
    projectId,
    version: 1,
    payee: `${merchantId}.example.test`,
    category: "api",
    trustState,
    settlementTarget: sandboxTarget,
    createdAt: SANDBOX_CREATED_AT,
    updatedAt: SANDBOX_CREATED_AT,
  };
  const requestedFundingSource = scenarioId === "funding_mismatch"
    ? {
        chainFamily: "ethereum",
        asset: "ETH",
        accountRef: "sandbox:synthetic:ethereum:eth",
        amountAtomic: "1000000000000000",
        decimals: 18,
      }
    : undefined;
  const intentWithoutDigest = {
    id: `intent_${payRunId}`,
    projectId,
    payRunId,
    source: "simulator" as const,
    agentId: agent.id,
    taskId: `task_${scenarioId}`,
    purpose: "Purchase a verified API result",
    merchant: {
      merchantId: merchant.id,
      payee: merchant.payee,
      category: merchant.category,
      trustState: merchant.trustState,
    },
    maximumAmount: sandboxMoney(scenarioId === "blocked" ? "9000000" : "500000"),
    quotedAmount: sandboxMoney(amountAtomic),
    expectedArtifactType: "api_result",
    ...(requestedFundingSource ? { requestedFundingSource } : {}),
    settlementTarget: sandboxTarget,
    createdAt: SANDBOX_CREATED_AT,
    expiresAt: SANDBOX_EXPIRES_AT,
  };
  const intent: PayIntent = { ...intentWithoutDigest, digest: sha256Canonical(intentWithoutDigest) };
  const fundingScopeDigest = sha256Canonical({
    source: requestedFundingSource ?? sandboxTarget,
    target: sandboxTarget,
    amountAtomic,
  });
  const policySnapshot: PolicyEvaluationSnapshot = {
    projectId,
    policyId: SANDBOX_POLICY_ID,
    policyVersion: 1,
    policyChecksum: "sha256:sandbox-policy-v1",
    inputSnapshotDigest: sha256Canonical({ projectId, payRunId, scenarioId, amountAtomic, merchantId, trustState, fundingScopeDigest }),
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    effectiveUntil: "2026-08-01T00:00:00.000Z",
    active: true,
    rules: {
      allowedMerchantIds: ["merchant_known", "merchant_new", "merchant_unknown"],
      blockedMerchantIds: [],
      blockedCategories: [],
      allowedRails: [SANDBOX_RAIL],
      transactionLimit: sandboxMoney("10000000"),
      absoluteHardLimit: sandboxMoney("100000000"),
      reviewThreshold: sandboxMoney("1000000"),
      requireReviewForNewMerchant: true,
      allowedArtifactTypes: ["api_result"],
    },
  };
  const paymentQuote: PaymentQuote = {
    id: `quote_${payRunId}`,
    projectId,
    merchantId,
    provider: "sandbox_quote_provider",
    rail: SANDBOX_RAIL,
    amount: sandboxMoney(amountAtomic),
    fee: sandboxMoney("0"),
    configurationVersion: "sandbox-v1",
    quotedAt: "2026-07-13T10:01:00.000Z",
    expiresAt: SANDBOX_EXPIRES_AT,
  };
  const fundingPreflightQuote: FundingPreflightQuote | undefined = requestedFundingSource
    ? {
        id: `funding_quote_${payRunId}`,
        projectId,
        planDigest: fundingScopeDigest,
        provider: "sandbox_funding_preflight",
        source: requestedFundingSource,
        target: sandboxTarget,
        requestedAmount: sandboxMoney(amountAtomic),
        estimatedFee: sandboxMoney("0"),
        configurationVersion: "sandbox-v1",
        quotedAt: "2026-07-13T10:01:00.000Z",
        expiresAt: SANDBOX_EXPIRES_AT,
        readOnly: true,
      }
    : undefined;
  return {
    scenarioId,
    project,
    agent,
    merchant,
    intent,
    policySnapshot,
    paymentQuote,
    ...(fundingPreflightQuote ? { fundingPreflightQuote } : {}),
    fundingScopeDigest,
  };
}

export function buildPolicyRequest(
  fixture: SandboxScenarioFixture,
  decisionId: string,
  evaluatedAt: string,
): PolicyEvaluationRequest {
  const remaining = sandboxMoney("100000000");
  return {
    decisionId,
    projectId: fixture.project.id,
    payRunId: fixture.intent.payRunId,
    payIntentId: fixture.intent.id,
    environment: "sandbox",
    actorScopes: ["payrun:execute"],
    project: fixture.project,
    agent: fixture.agent,
    merchant: fixture.merchant,
    intent: fixture.intent,
    evaluatedBy: { service: "zenfix_policy_engine", engineVersion: "1.0.0" },
    policySnapshot: fixture.policySnapshot,
    budgetSnapshot: { projectRemaining: remaining, agentRemaining: remaining, merchantRemaining: remaining },
    paymentQuote: fixture.paymentQuote,
    ...(fixture.fundingPreflightQuote ? { fundingPreflightQuote: fixture.fundingPreflightQuote } : {}),
    fundingScopeDigest: fixture.fundingScopeDigest,
    settlementTarget: sandboxTarget,
    rail: SANDBOX_RAIL,
    evaluatedAt,
  };
}
