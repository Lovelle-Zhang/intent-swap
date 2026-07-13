import { IntentExpiredError, InvariantViolationError } from "./errors";
import {
  assertIntentCurrent,
  assertMoney,
  assertSameProject,
  assertUtcIso,
  deepFreeze,
} from "./invariants";
import type {
  Approval,
  CanonicalPolicyDecision,
  LogicalSettlementTarget,
  Money,
  PolicyCheck,
  PolicyCheckOutcome,
  PolicyEvaluationRequest,
  PolicyRuleClass,
} from "./types";

interface DerivedCheck {
  readonly ruleClass: PolicyRuleClass;
  readonly reasonCode: string;
  readonly outcome: PolicyCheckOutcome;
  readonly explanation: string;
}

function sameTarget(left: LogicalSettlementTarget, right: LogicalSettlementTarget): boolean {
  return (
    left.kind === right.kind &&
    left.chainFamily === right.chainFamily &&
    left.asset === right.asset &&
    left.decimals === right.decimals
  );
}

function sameMoney(left: Money, right: Money): boolean {
  return (
    left.amountAtomic === right.amountAtomic &&
    left.asset === right.asset &&
    left.decimals === right.decimals &&
    left.settlementRef.kind === "logical" &&
    right.settlementRef.kind === "logical" &&
    sameTarget(left.settlementRef, right.settlementRef)
  );
}

function sameFundingSource(
  left: PolicyEvaluationRequest["intent"]["requestedFundingSource"],
  right: PolicyEvaluationRequest["intent"]["requestedFundingSource"],
): boolean {
  return Boolean(
    left &&
      right &&
      left.chainFamily === right.chainFamily &&
      left.asset === right.asset &&
      left.accountRef === right.accountRef &&
      left.amountAtomic === right.amountAtomic &&
      left.decimals === right.decimals,
  );
}

function requireSnapshot(input: PolicyEvaluationRequest): void {
  if (
    !input ||
    !input.project ||
    !input.agent ||
    !input.merchant ||
    !input.intent ||
    !input.evaluatedBy ||
    !input.policySnapshot ||
    !input.policySnapshot.rules ||
    !input.budgetSnapshot ||
    !input.paymentQuote ||
    !input.fundingScopeDigest ||
    !input.rail ||
    !Array.isArray(input.actorScopes)
  ) {
    throw new InvariantViolationError("Policy evaluation requires a complete authoritative snapshot");
  }

  assertSameProject(
    input.projectId,
    input.project,
    input.agent,
    input.merchant,
    input.intent,
    input.policySnapshot,
    input.paymentQuote,
    ...(input.fundingPreflightQuote ? [input.fundingPreflightQuote] : []),
  );
  if (
    input.project.id !== input.projectId ||
    input.intent.id !== input.payIntentId ||
    input.intent.payRunId !== input.payRunId ||
    input.intent.agentId !== input.agent.id ||
    input.intent.merchant.merchantId !== input.merchant.id ||
    input.agent.policyId !== input.policySnapshot.policyId
  ) {
    throw new InvariantViolationError("Policy snapshot identity does not match the immutable PayIntent");
  }
  if (
    input.intent.merchant.payee !== input.merchant.payee ||
    input.intent.merchant.category !== input.merchant.category ||
    input.intent.merchant.trustState !== input.merchant.trustState ||
    !sameTarget(input.intent.settlementTarget, input.settlementTarget) ||
    !sameTarget(input.merchant.settlementTarget, input.settlementTarget)
  ) {
    throw new InvariantViolationError("Resolved Merchant or settlement target changed from the PayIntent");
  }

  assertIntentCurrent(input.intent, input.evaluatedAt);
  assertUtcIso(input.evaluatedAt, "policy.evaluatedAt");
  assertUtcIso(input.policySnapshot.effectiveFrom, "policySnapshot.effectiveFrom");
  if (input.policySnapshot.effectiveUntil) {
    assertUtcIso(input.policySnapshot.effectiveUntil, "policySnapshot.effectiveUntil");
  }
  assertUtcIso(input.paymentQuote.quotedAt, "paymentQuote.quotedAt");
  assertUtcIso(input.paymentQuote.expiresAt, "paymentQuote.expiresAt");

  const amounts = [
    input.intent.maximumAmount,
    input.intent.quotedAmount,
    input.paymentQuote.amount,
    input.paymentQuote.fee,
    input.policySnapshot.rules.transactionLimit,
    input.policySnapshot.rules.absoluteHardLimit,
    input.policySnapshot.rules.reviewThreshold,
    input.budgetSnapshot.projectRemaining,
    input.budgetSnapshot.agentRemaining,
    input.budgetSnapshot.merchantRemaining,
  ];
  for (const amount of amounts) assertMoney(amount);

  if (input.fundingPreflightQuote) {
    assertMoney(input.fundingPreflightQuote.requestedAmount);
    assertMoney(input.fundingPreflightQuote.estimatedFee);
    assertUtcIso(input.fundingPreflightQuote.quotedAt, "fundingPreflightQuote.quotedAt");
    assertUtcIso(input.fundingPreflightQuote.expiresAt, "fundingPreflightQuote.expiresAt");
    if (
      input.fundingPreflightQuote.readOnly !== true ||
      input.fundingPreflightQuote.planDigest !== input.fundingScopeDigest ||
      !sameTarget(input.fundingPreflightQuote.target, input.settlementTarget) ||
      !sameFundingSource(input.fundingPreflightQuote.source, input.intent.requestedFundingSource) ||
      !sameMoney(input.fundingPreflightQuote.requestedAmount, input.intent.quotedAmount) ||
      Date.parse(input.fundingPreflightQuote.expiresAt) <= Date.parse(input.evaluatedAt)
    ) {
      throw new InvariantViolationError("Funding preflight must be current, read-only, and bind the requested source, amount, target, and scope");
    }
  }
  const source = input.intent.requestedFundingSource;
  const sourceMismatch =
    source !== undefined &&
    (source.chainFamily !== input.settlementTarget.chainFamily ||
      source.asset !== input.settlementTarget.asset ||
      source.decimals !== input.settlementTarget.decimals);
  if (sourceMismatch && !input.fundingPreflightQuote) {
    throw new InvariantViolationError("Funding mismatch requires a read-only Funding preflight quote");
  }
}

function validateApprovalContext(input: PolicyEvaluationRequest): Approval | undefined {
  const { approval, recheckContext } = input;
  if (!approval && !recheckContext) return undefined;
  if (!approval || !recheckContext || !approval.decision) {
    throw new InvariantViolationError("Approval-aware Policy evaluation requires one final decision");
  }
  assertSameProject(input.projectId, approval, approval.request, approval.decision);
  if (
    approval.payRunId !== input.payRunId ||
    approval.request.payRunId !== input.payRunId ||
    approval.request.payIntentId !== input.intent.id ||
    approval.status !== "approved" ||
    approval.decision.outcome !== "approved" ||
    approval.decision.id !== recheckContext.approvalDecisionId ||
    approval.request.approvalScopeDigest !== recheckContext.approvedScopeDigest ||
    approval.decision.approvalScopeDigest !== recheckContext.approvedScopeDigest
  ) {
    throw new InvariantViolationError("Approval identity or scope digest changed");
  }
  if (
    approval.request.intentDigest !== input.intent.digest ||
    approval.request.policyId !== input.policySnapshot.policyId ||
    approval.request.policyVersion !== input.policySnapshot.policyVersion ||
    approval.request.merchantId !== input.merchant.id ||
    !sameMoney(approval.request.amount, input.intent.quotedAmount) ||
    !sameTarget(approval.request.settlementTarget, input.settlementTarget) ||
    approval.request.rail !== input.rail ||
    approval.request.fundingScopeDigest !== input.fundingScopeDigest
  ) {
    throw new InvariantViolationError("Approval-bound intent, Policy, Merchant, amount, target, rail, or Funding scope changed");
  }
  const covered = new Set(approval.request.coveredReasonCodes);
  if (recheckContext.coveredReasonCodes.some((reason) => !covered.has(reason))) {
    throw new InvariantViolationError("Policy recheck cannot expand Approval-covered reasons");
  }
  assertUtcIso(approval.request.expiresAt, "approval.request.expiresAt");
  if (Date.parse(approval.request.expiresAt) <= Date.parse(input.evaluatedAt)) {
    throw new IntentExpiredError(approval.request.expiresAt, input.evaluatedAt);
  }
  return approval;
}

function add(
  ruleClass: PolicyRuleClass,
  reasonCode: string,
  outcome: PolicyCheckOutcome,
  explanation: string,
): DerivedCheck {
  return { ruleClass, reasonCode, outcome, explanation };
}

function totalQuoteAtomic(input: PolicyEvaluationRequest): bigint {
  const amount = input.paymentQuote.amount;
  const fee = input.paymentQuote.fee;
  if (!sameTarget(amount.settlementRef as LogicalSettlementTarget, fee.settlementRef as LogicalSettlementTarget) || amount.asset !== fee.asset || amount.decimals !== fee.decimals) {
    throw new InvariantViolationError("Payment amount and fee must use the same settlement unit");
  }
  return BigInt(amount.amountAtomic) + BigInt(fee.amountAtomic);
}

function deriveChecks(input: PolicyEvaluationRequest): readonly DerivedCheck[] {
  const rules = input.policySnapshot.rules;
  const now = Date.parse(input.evaluatedAt);
  const total = totalQuoteAtomic(input);
  const policyActive =
    input.policySnapshot.active &&
    Date.parse(input.policySnapshot.effectiveFrom) <= now &&
    (!input.policySnapshot.effectiveUntil || Date.parse(input.policySnapshot.effectiveUntil) > now);
  const environmentSupported = input.environment === "sandbox" && input.project.mode === "sandbox";
  const quoteValid =
    input.paymentQuote.merchantId === input.merchant.id &&
    input.paymentQuote.rail === input.rail &&
    sameMoney(input.paymentQuote.amount, input.intent.quotedAmount) &&
    Date.parse(input.paymentQuote.expiresAt) > now;
  const merchantBlocked =
    input.merchant.trustState === "blocked" || rules.blockedMerchantIds.includes(input.merchant.id);
  const merchantUnknown =
    input.merchant.trustState === "unknown" || !rules.allowedMerchantIds.includes(input.merchant.id);
  const categoryBlocked = rules.blockedCategories.includes(input.merchant.category);
  const newMerchantReview = input.merchant.trustState === "new" && rules.requireReviewForNewMerchant;
  const thresholdReview = total >= BigInt(rules.reviewThreshold.amountAtomic);
  const artifactSupported = rules.allowedArtifactTypes.includes(input.intent.expectedArtifactType);
  const within = (limit: Money) => total <= BigInt(limit.amountAtomic);

  return [
    add("structural", "input.valid", "pass", "Canonical inputs are valid."),
    add("structural", environmentSupported ? "environment.supported" : "environment.unsupported", environmentSupported ? "pass" : "block", "Execution environment was checked."),
    add("emergency", input.project.killSwitchActive ? "execution.kill_switch_active" : "execution.kill_switch_inactive", input.project.killSwitchActive ? "block" : "pass", "Project kill switch was checked."),
    add("identity", input.actorScopes.includes("payrun:execute") ? "auth.scope_present" : "auth.scope_missing", input.actorScopes.includes("payrun:execute") ? "pass" : "block", "Authenticated actor scope was checked."),
    add("identity", input.agent.status === "active" ? "agent.active" : "agent.inactive", input.agent.status === "active" ? "pass" : "block", "Agent status was checked."),
    add("identity", policyActive ? "policy.active_and_bound" : "policy.missing_or_inactive", policyActive ? "pass" : "block", "Policy activation and binding were checked."),
    add("payee", merchantBlocked ? "merchant.blocked" : merchantUnknown ? "merchant.unknown" : "merchant.allowed", merchantBlocked || merchantUnknown ? "block" : "pass", "Merchant trust and allowlist were checked."),
    add("payee", categoryBlocked ? "category.blocked" : "category.allowed", categoryBlocked ? "block" : "pass", "Merchant category was checked."),
    add("settlement", input.settlementTarget.asset === "USDC" ? "settlement.asset_allowed" : "settlement.asset_not_allowed", input.settlementTarget.asset === "USDC" ? "pass" : "block", "Settlement asset was checked."),
    add("settlement", input.settlementTarget.chainFamily === "base" ? "settlement.chain_allowed" : "settlement.chain_not_allowed", input.settlementTarget.chainFamily === "base" ? "pass" : "block", "Settlement chain was checked."),
    add("settlement", rules.allowedRails.includes(input.rail) ? "settlement.rail_allowed" : "settlement.rail_not_allowed", rules.allowedRails.includes(input.rail) ? "pass" : "block", "Payment rail was checked."),
    add("settlement", quoteValid ? "quote.valid" : "quote.missing_or_expired", quoteValid ? "pass" : "block", "Payment quote identity and expiry were checked."),
    add("hard_limit", within(rules.absoluteHardLimit) ? "amount.within_absolute_limit" : "amount.hard_limit_exceeded", within(rules.absoluteHardLimit) ? "pass" : "block", "Absolute limit was checked in atomic units."),
    add("hard_limit", within(rules.transactionLimit) ? "amount.within_transaction_limit" : "amount.transaction_limit_exceeded", within(rules.transactionLimit) ? "pass" : "block", "Transaction limit was checked in atomic units."),
    add("hard_limit", within(input.budgetSnapshot.projectRemaining) ? "budget.project_available" : "budget.project_limit_exceeded", within(input.budgetSnapshot.projectRemaining) ? "pass" : "block", "Project budget eligibility was checked."),
    add("hard_limit", within(input.budgetSnapshot.agentRemaining) ? "budget.agent_available" : "budget.agent_limit_exceeded", within(input.budgetSnapshot.agentRemaining) ? "pass" : "block", "Agent budget eligibility was checked."),
    add("hard_limit", within(input.budgetSnapshot.merchantRemaining) ? "budget.merchant_available" : "budget.merchant_limit_exceeded", within(input.budgetSnapshot.merchantRemaining) ? "pass" : "block", "Merchant budget eligibility was checked."),
    add("review", newMerchantReview ? "merchant.new_requires_review" : thresholdReview ? "approval.threshold_reached" : "approval.not_required", newMerchantReview || thresholdReview ? "review" : "pass", "Human review rules were checked."),
    add("evidence", artifactSupported ? "artifact.proof_supported" : "artifact.proof_required", artifactSupported ? "pass" : "block", "Required artifact eligibility was checked."),
  ];
}

function decisionValidUntil(input: PolicyEvaluationRequest): string {
  const candidates = [
    input.intent.expiresAt,
    input.paymentQuote.expiresAt,
    ...(input.policySnapshot.effectiveUntil ? [input.policySnapshot.effectiveUntil] : []),
    ...(input.fundingPreflightQuote ? [input.fundingPreflightQuote.expiresAt] : []),
  ];
  return candidates.reduce((earliest, candidate) =>
    Date.parse(candidate) < Date.parse(earliest) ? candidate : earliest,
  );
}

export function evaluatePolicy(input: PolicyEvaluationRequest): CanonicalPolicyDecision {
  requireSnapshot(input);
  const approval = validateApprovalContext(input);
  const coveredReasons = new Set(input.recheckContext?.coveredReasonCodes ?? []);
  const checks: PolicyCheck[] = deriveChecks(input).map((candidate, index) => {
    const covered = candidate.outcome === "review" && approval && coveredReasons.has(candidate.reasonCode);
    return {
      sequence: index + 1,
      ruleClass: candidate.ruleClass,
      reasonCode: candidate.reasonCode,
      outcome: covered ? "pass" : candidate.outcome,
      explanation: candidate.explanation,
      ...(covered ? { satisfiedByApprovalDecisionId: approval.decision!.id } : {}),
    };
  });
  const blocks = checks.filter((check) => check.outcome === "block");
  const reviews = checks.filter((check) => check.outcome === "review");
  const outcome = blocks.length ? "blocked" : reviews.length ? "needs_review" : "allowed";
  const reasonCodes = (blocks.length ? blocks : reviews).map((check) => check.reasonCode);
  const riskLevel = outcome === "blocked" ? "critical" : outcome === "needs_review" ? "medium" : "low";
  const nextAction = outcome === "allowed" ? "prepare_funding" : outcome === "needs_review" ? "request_approval" : "stop";
  const decision = { outcome, reasonCodes: [...reasonCodes], riskLevel, nextAction } as const;

  return deepFreeze({
    id: input.decisionId,
    projectId: input.projectId,
    payRunId: input.payRunId,
    payIntentId: input.payIntentId,
    policyId: input.policySnapshot.policyId,
    policyVersion: input.policySnapshot.policyVersion,
    policyChecksum: input.policySnapshot.policyChecksum,
    engineVersion: input.evaluatedBy.engineVersion,
    inputSnapshotDigest: input.policySnapshot.inputSnapshotDigest,
    outcome,
    checks,
    reasonCodes: [...reasonCodes],
    riskLevel,
    evaluatedAt: input.evaluatedAt,
    validUntil: decisionValidUntil(input),
    nextAction,
    ...(approval && outcome === "allowed" ? { authorizationBasisApprovalDecisionId: approval.decision!.id } : {}),
    evaluatedBy: { ...input.evaluatedBy },
    policySnapshot: {
      projectId: input.policySnapshot.projectId,
      policyId: input.policySnapshot.policyId,
      policyVersion: input.policySnapshot.policyVersion,
      policyChecksum: input.policySnapshot.policyChecksum,
      inputSnapshotDigest: input.policySnapshot.inputSnapshotDigest,
    },
    decision,
  });
}
