import { SchemaValidationError } from "./errors";
import {
  assertAtomicAmount,
  assertDecimals,
  assertEvidenceCompatible,
  assertLedgerBalanced,
  assertMoney,
  assertPayRunInvariants,
  assertUtcIso,
  deepFreeze,
} from "./invariants";
import {
  EVIDENCE_KINDS,
  BUDGET_RESERVATION_STATUS_VALUES,
  PAY_RUN_STATUS_VALUES,
  type Agent,
  type Approval,
  type ApprovalDecision,
  type ApprovalRequest,
  type BudgetReservation,
  type ArtifactProof,
  type AuditEvent,
  type CanonicalExecutionProof,
  type CanonicalFundingPreparation,
  type CanonicalPaymentExecution,
  type CanonicalPolicyDecision,
  type CancellationRecord,
  type CreatePayRunCommand,
  type DomainOutboxEvent,
  type EvidenceReference,
  type ExecutionAttempt,
  type ExecutionProof,
  type ExecutionProofRequest,
  type ExpiryRecord,
  type FailureRecord,
  type FundingAttempt,
  type FundingPreflightQuote,
  type FundingPreparation,
  type FundingProof,
  type FundingRouteStep,
  type FundingSource,
  type IdempotencyRecord,
  type InboxEvent,
  type JsonValue,
  type LedgerDraft,
  type LedgerEntry,
  type LedgerJournal,
  type LogicalSettlementTarget,
  type Merchant,
  type MerchantReference,
  type Money,
  type NoTransferProof,
  type OnChainAssetRef,
  type PayIntent,
  type PaymentExecution,
  type PaymentInstruction,
  type PaymentProof,
  type PaymentQuote,
  type PayRun,
  type PayRunTransitionCommand,
  type Policy,
  type PolicyBudgetSnapshot,
  type PolicyCheck,
  type PolicyDecision,
  type PolicyDecisionValue,
  type PolicyEvaluationAttempt,
  type PolicyEvaluationRequest,
  type PolicyEvaluationSnapshot,
  type PolicyEvaluator,
  type PolicyRecheckContext,
  type PolicyRuleSnapshot,
  type PolicySnapshot,
  type Project,
  type SettlementRef,
} from "./types";

export type SafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: SchemaValidationError };

export interface RuntimeSchema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

type Parser<T> = (value: unknown, path: string) => T;

function validationError(path: string, message: string, value?: unknown): SchemaValidationError {
  return new SchemaValidationError(`${path}: ${message}`, { path, value });
}

function defineSchema<T>(parser: Parser<T>): RuntimeSchema<T> {
  return Object.freeze({
    parse(value: unknown): T {
      try {
        return deepFreeze(parser(value, "$"));
      } catch (error) {
        if (error instanceof SchemaValidationError) throw error;
        const message = error instanceof Error ? error.message : "Unknown validation failure";
        throw new SchemaValidationError(message, { cause: error });
      }
    },
    safeParse(value: unknown): SafeParseResult<T> {
      try {
        return { success: true, data: this.parse(value) };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof SchemaValidationError
              ? error
              : new SchemaValidationError("Unknown validation failure", { cause: error }),
        };
      }
    },
  });
}

function object(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(path, "expected an object", value);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw validationError(`${path}.${key}`, "unexpected field", record[key]);
  }
  return record;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw validationError(path, "expected a non-empty string", value);
  }
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw validationError(path, "expected a boolean", value);
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw validationError(path, `expected an integer >= ${minimum}`, value);
  }
  return value as number;
}

function timestamp(value: unknown, path: string): string {
  try {
    assertUtcIso(value, path);
    return value;
  } catch {
    throw validationError(path, "expected a UTC ISO-8601 timestamp", value);
  }
}

function enumeration<const T extends readonly string[]>(
  value: unknown,
  path: string,
  values: T,
): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw validationError(path, `expected one of: ${values.join(", ")}`, value);
  }
  return value as T[number];
}

function array<T>(value: unknown, path: string, parser: Parser<T>): readonly T[] {
  if (!Array.isArray(value)) throw validationError(path, "expected an array", value);
  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

function optional<T>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  parser: Parser<T>,
): T | undefined {
  const value = record[key];
  return value === undefined ? undefined : parser(value, `${path}.${key}`);
}

function parseJson(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => parseJson(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = parseJson(nested, `${path}.${key}`);
    }
    return result;
  }
  throw validationError(path, "expected JSON-compatible data", value);
}

function parseJsonRecord(value: unknown, path: string): Readonly<Record<string, JsonValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(path, "expected a JSON object", value);
  }
  return parseJson(value, path) as Readonly<Record<string, JsonValue>>;
}

function parseAggregateMeta(record: Record<string, unknown>, path: string) {
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    version: integer(record.version, `${path}.version`, 1),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(record.updatedAt, `${path}.updatedAt`),
  };
}

const LOGICAL_TARGET_KEYS = ["kind", "chainFamily", "asset", "decimals"];

function parseLogicalTarget(value: unknown, path: string): LogicalSettlementTarget {
  const record = object(value, path, LOGICAL_TARGET_KEYS);
  if (
    record.kind !== "logical" ||
    record.chainFamily !== "base" ||
    record.asset !== "USDC" ||
    record.decimals !== 6
  ) {
    throw validationError(path, "logical settlement target must be USDC/Base with 6 decimals", value);
  }
  return { kind: "logical", chainFamily: "base", asset: "USDC", decimals: 6 };
}

function parseOnChainTarget(value: unknown, path: string): OnChainAssetRef {
  const record = object(value, path, [
    "kind",
    "environment",
    "chainId",
    "contractAddress",
    "asset",
    "decimals",
    "configVersion",
  ]);
  if (record.kind !== "on_chain" || record.environment !== "live_guarded") {
    throw validationError(path, "on-chain references require live_guarded environment", value);
  }
  const decimals = integer(record.decimals, `${path}.decimals`);
  try {
    assertDecimals(decimals);
  } catch {
    throw validationError(`${path}.decimals`, "invalid asset decimals", decimals);
  }
  return {
    kind: "on_chain",
    environment: "live_guarded",
    chainId: integer(record.chainId, `${path}.chainId`, 1),
    contractAddress: string(record.contractAddress, `${path}.contractAddress`),
    asset: string(record.asset, `${path}.asset`),
    decimals,
    configVersion: string(record.configVersion, `${path}.configVersion`),
  };
}

function parseSettlementRef(value: unknown, path: string): SettlementRef {
  if (value && typeof value === "object" && (value as Record<string, unknown>).kind === "logical") {
    return parseLogicalTarget(value, path);
  }
  return parseOnChainTarget(value, path);
}

function parseMoney(value: unknown, path: string): Money {
  const record = object(value, path, ["amountAtomic", "asset", "settlementRef", "decimals"]);
  const amountAtomic = record.amountAtomic;
  const decimals = record.decimals;
  try {
    assertAtomicAmount(amountAtomic, `${path}.amountAtomic`);
    assertDecimals(decimals, `${path}.decimals`);
  } catch {
    throw validationError(path, "invalid integer-atomic Money", value);
  }
  const result: Money = {
    amountAtomic,
    asset: string(record.asset, `${path}.asset`),
    settlementRef: parseSettlementRef(record.settlementRef, `${path}.settlementRef`),
    decimals,
  };
  try {
    assertMoney(result);
  } catch {
    throw validationError(path, "Money asset/decimals do not match settlement reference", value);
  }
  return result;
}

function parseMerchantReference(value: unknown, path: string): MerchantReference {
  const record = object(value, path, ["merchantId", "payee", "category", "trustState"]);
  return {
    merchantId: string(record.merchantId, `${path}.merchantId`),
    payee: string(record.payee, `${path}.payee`),
    category: string(record.category, `${path}.category`),
    trustState: enumeration(record.trustState, `${path}.trustState`, [
      "known",
      "new",
      "unknown",
      "blocked",
    ] as const),
  };
}

function parseFundingSource(value: unknown, path: string): FundingSource {
  const record = object(value, path, [
    "chainFamily",
    "asset",
    "accountRef",
    "amountAtomic",
    "decimals",
  ]);
  try {
    assertAtomicAmount(record.amountAtomic, `${path}.amountAtomic`);
    assertDecimals(record.decimals, `${path}.decimals`);
  } catch {
    throw validationError(path, "invalid Funding source amount", value);
  }
  return {
    chainFamily: string(record.chainFamily, `${path}.chainFamily`),
    asset: string(record.asset, `${path}.asset`),
    accountRef: string(record.accountRef, `${path}.accountRef`),
    amountAtomic: record.amountAtomic,
    decimals: record.decimals,
  };
}

function parsePayIntent(value: unknown, path: string): PayIntent {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "source",
    "agentId",
    "taskId",
    "purpose",
    "merchant",
    "maximumAmount",
    "quotedAmount",
    "expectedArtifactType",
    "requestedFundingSource",
    "settlementTarget",
    "createdAt",
    "expiresAt",
    "digest",
  ]);
  const requestedFundingSource = optional(
    record,
    "requestedFundingSource",
    path,
    parseFundingSource,
  );
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    source: enumeration(record.source, `${path}.source`, [
      "api",
      "sdk",
      "simulator",
      "workflow",
      "manual",
    ] as const),
    agentId: string(record.agentId, `${path}.agentId`),
    taskId: string(record.taskId, `${path}.taskId`),
    purpose: string(record.purpose, `${path}.purpose`),
    merchant: parseMerchantReference(record.merchant, `${path}.merchant`),
    maximumAmount: parseMoney(record.maximumAmount, `${path}.maximumAmount`),
    quotedAmount: parseMoney(record.quotedAmount, `${path}.quotedAmount`),
    expectedArtifactType: string(record.expectedArtifactType, `${path}.expectedArtifactType`),
    ...(requestedFundingSource ? { requestedFundingSource } : {}),
    settlementTarget: parseLogicalTarget(record.settlementTarget, `${path}.settlementTarget`),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    expiresAt: timestamp(record.expiresAt, `${path}.expiresAt`),
    digest: string(record.digest, `${path}.digest`),
  };
}

function parsePolicyCheck(value: unknown, path: string): PolicyCheck {
  const record = object(value, path, [
    "sequence",
    "ruleClass",
    "reasonCode",
    "outcome",
    "explanation",
    "satisfiedByApprovalDecisionId",
  ]);
  const satisfied = optional(record, "satisfiedByApprovalDecisionId", path, string);
  return {
    sequence: integer(record.sequence, `${path}.sequence`, 1),
    ruleClass: enumeration(record.ruleClass, `${path}.ruleClass`, [
      "structural",
      "emergency",
      "identity",
      "payee",
      "settlement",
      "hard_limit",
      "review",
      "evidence",
    ] as const),
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    outcome: enumeration(record.outcome, `${path}.outcome`, ["pass", "review", "block"] as const),
    explanation: string(record.explanation, `${path}.explanation`),
    ...(satisfied ? { satisfiedByApprovalDecisionId: satisfied } : {}),
  };
}

function parsePolicyEvaluator(value: unknown, path: string): PolicyEvaluator {
  const record = object(value, path, ["service", "engineVersion"]);
  if (record.service !== "zenfix_policy_engine") {
    throw validationError(
      `${path}.service`,
      "expected zenfix_policy_engine",
      record.service,
    );
  }
  return {
    service: "zenfix_policy_engine",
    engineVersion: string(record.engineVersion, `${path}.engineVersion`),
  };
}

function parsePolicySnapshot(value: unknown, path: string): PolicySnapshot {
  const record = object(value, path, [
    "projectId",
    "policyId",
    "policyVersion",
    "policyChecksum",
    "inputSnapshotDigest",
  ]);
  return {
    projectId: string(record.projectId, `${path}.projectId`),
    policyId: string(record.policyId, `${path}.policyId`),
    policyVersion: integer(record.policyVersion, `${path}.policyVersion`, 1),
    policyChecksum: string(record.policyChecksum, `${path}.policyChecksum`),
    inputSnapshotDigest: string(
      record.inputSnapshotDigest,
      `${path}.inputSnapshotDigest`,
    ),
  };
}

function parsePolicyRuleSnapshot(value: unknown, path: string): PolicyRuleSnapshot {
  const record = object(value, path, [
    "allowedMerchantIds",
    "blockedMerchantIds",
    "blockedCategories",
    "allowedRails",
    "transactionLimit",
    "absoluteHardLimit",
    "reviewThreshold",
    "requireReviewForNewMerchant",
    "allowedArtifactTypes",
  ]);
  return {
    allowedMerchantIds: array(
      record.allowedMerchantIds,
      `${path}.allowedMerchantIds`,
      string,
    ),
    blockedMerchantIds: array(
      record.blockedMerchantIds,
      `${path}.blockedMerchantIds`,
      string,
    ),
    blockedCategories: array(
      record.blockedCategories,
      `${path}.blockedCategories`,
      string,
    ),
    allowedRails: array(record.allowedRails, `${path}.allowedRails`, string),
    transactionLimit: parseMoney(
      record.transactionLimit,
      `${path}.transactionLimit`,
    ),
    absoluteHardLimit: parseMoney(
      record.absoluteHardLimit,
      `${path}.absoluteHardLimit`,
    ),
    reviewThreshold: parseMoney(
      record.reviewThreshold,
      `${path}.reviewThreshold`,
    ),
    requireReviewForNewMerchant: boolean(
      record.requireReviewForNewMerchant,
      `${path}.requireReviewForNewMerchant`,
    ),
    allowedArtifactTypes: array(
      record.allowedArtifactTypes,
      `${path}.allowedArtifactTypes`,
      string,
    ),
  };
}

function parsePolicyEvaluationSnapshot(
  value: unknown,
  path: string,
): PolicyEvaluationSnapshot {
  const record = object(value, path, [
    "projectId",
    "policyId",
    "policyVersion",
    "policyChecksum",
    "inputSnapshotDigest",
    "effectiveFrom",
    "effectiveUntil",
    "active",
    "rules",
  ]);
  const reference = parsePolicySnapshot(
    {
      projectId: record.projectId,
      policyId: record.policyId,
      policyVersion: record.policyVersion,
      policyChecksum: record.policyChecksum,
      inputSnapshotDigest: record.inputSnapshotDigest,
    },
    path,
  );
  return {
    ...reference,
    effectiveFrom: timestamp(record.effectiveFrom, `${path}.effectiveFrom`),
    effectiveUntil:
      record.effectiveUntil === null
        ? null
        : timestamp(record.effectiveUntil, `${path}.effectiveUntil`),
    active: boolean(record.active, `${path}.active`),
    rules: parsePolicyRuleSnapshot(record.rules, `${path}.rules`),
  };
}

function parsePolicyDecisionValue(value: unknown, path: string): PolicyDecisionValue {
  const record = object(value, path, [
    "outcome",
    "reasonCodes",
    "riskLevel",
    "nextAction",
  ]);
  return {
    outcome: enumeration(record.outcome, `${path}.outcome`, [
      "allowed",
      "needs_review",
      "blocked",
    ] as const),
    reasonCodes: array(record.reasonCodes, `${path}.reasonCodes`, string),
    riskLevel: enumeration(record.riskLevel, `${path}.riskLevel`, [
      "low",
      "medium",
      "high",
      "critical",
    ] as const),
    nextAction: enumeration(record.nextAction, `${path}.nextAction`, [
      "prepare_funding",
      "request_approval",
      "stop",
    ] as const),
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function parsePolicyDecision(
  value: unknown,
  path: string,
): CanonicalPolicyDecision {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "payIntentId",
    "policyId",
    "policyVersion",
    "policyChecksum",
    "engineVersion",
    "inputSnapshotDigest",
    "outcome",
    "checks",
    "reasonCodes",
    "riskLevel",
    "evaluatedAt",
    "validUntil",
    "nextAction",
    "authorizationBasisApprovalDecisionId",
    "evaluatedBy",
    "policySnapshot",
    "decision",
  ]);
  const authorizationBasis = optional(
    record,
    "authorizationBasisApprovalDecisionId",
    path,
    string,
  );
  const flat: Omit<PolicyDecision, "evaluatedBy" | "policySnapshot" | "decision"> = {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    payIntentId: string(record.payIntentId, `${path}.payIntentId`),
    policyId: string(record.policyId, `${path}.policyId`),
    policyVersion: integer(record.policyVersion, `${path}.policyVersion`, 1),
    policyChecksum: string(record.policyChecksum, `${path}.policyChecksum`),
    engineVersion: string(record.engineVersion, `${path}.engineVersion`),
    inputSnapshotDigest: string(record.inputSnapshotDigest, `${path}.inputSnapshotDigest`),
    outcome: enumeration(record.outcome, `${path}.outcome`, [
      "allowed",
      "needs_review",
      "blocked",
    ] as const),
    checks: array(record.checks, `${path}.checks`, parsePolicyCheck),
    reasonCodes: array(record.reasonCodes, `${path}.reasonCodes`, string),
    riskLevel: enumeration(record.riskLevel, `${path}.riskLevel`, [
      "low",
      "medium",
      "high",
      "critical",
    ] as const),
    evaluatedAt: timestamp(record.evaluatedAt, `${path}.evaluatedAt`),
    validUntil: timestamp(record.validUntil, `${path}.validUntil`),
    nextAction: enumeration(record.nextAction, `${path}.nextAction`, [
      "prepare_funding",
      "request_approval",
      "stop",
    ] as const),
    ...(authorizationBasis ? { authorizationBasisApprovalDecisionId: authorizationBasis } : {}),
  };
  const evaluatedBy = parsePolicyEvaluator(record.evaluatedBy, `${path}.evaluatedBy`);
  const policySnapshot = parsePolicySnapshot(record.policySnapshot, `${path}.policySnapshot`);
  const decision = parsePolicyDecisionValue(record.decision, `${path}.decision`);

  if (
    evaluatedBy.engineVersion !== flat.engineVersion ||
    policySnapshot.projectId !== flat.projectId ||
    policySnapshot.policyId !== flat.policyId ||
    policySnapshot.policyVersion !== flat.policyVersion ||
    policySnapshot.policyChecksum !== flat.policyChecksum ||
    policySnapshot.inputSnapshotDigest !== flat.inputSnapshotDigest ||
    decision.outcome !== flat.outcome ||
    decision.riskLevel !== flat.riskLevel ||
    decision.nextAction !== flat.nextAction ||
    !sameStrings(decision.reasonCodes, flat.reasonCodes)
  ) {
    throw validationError(
      path,
      "PolicyDecision canonical sections must match their compatibility fields",
      value,
    );
  }

  return {
    ...flat,
    evaluatedBy,
    policySnapshot,
    decision,
  };
}

function parseRecheckContext(value: unknown, path: string): PolicyRecheckContext {
  const record = object(value, path, [
    "approvalDecisionId",
    "approvedScopeDigest",
    "coveredReasonCodes",
  ]);
  return {
    approvalDecisionId: string(record.approvalDecisionId, `${path}.approvalDecisionId`),
    approvedScopeDigest: string(record.approvedScopeDigest, `${path}.approvedScopeDigest`),
    coveredReasonCodes: array(record.coveredReasonCodes, `${path}.coveredReasonCodes`, string),
  };
}

function parsePolicyEvaluationAttempt(value: unknown, path: string): PolicyEvaluationAttempt {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "attempt",
    "startedAt",
    "errorCode",
    "retryable",
    "recheckContext",
  ]);
  const errorCode = optional(record, "errorCode", path, string);
  const retryable = optional(record, "retryable", path, boolean);
  const recheckContext = optional(record, "recheckContext", path, parseRecheckContext);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    attempt: integer(record.attempt, `${path}.attempt`, 1),
    startedAt: timestamp(record.startedAt, `${path}.startedAt`),
    ...(errorCode ? { errorCode } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(recheckContext ? { recheckContext } : {}),
  };
}

function parseApprovalRequest(value: unknown, path: string): ApprovalRequest {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "payIntentId",
    "createdAt",
    "expiresAt",
    "createdAtPayRunVersion",
    "intentDigest",
    "policyDecisionId",
    "policyId",
    "policyVersion",
    "policyChecksum",
    "policyEvaluationDigest",
    "agentId",
    "merchantId",
    "purpose",
    "amount",
    "amountCeiling",
    "settlementTarget",
    "rail",
    "fundingScopeDigest",
    "coveredReasonCodes",
    "approvalScopeDigest",
    "generation",
    "requester",
  ]);
  const requester = object(record.requester, `${path}.requester`, ["actorId", "actorType"]);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    payIntentId: string(record.payIntentId, `${path}.payIntentId`),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    expiresAt: timestamp(record.expiresAt, `${path}.expiresAt`),
    createdAtPayRunVersion: integer(
      record.createdAtPayRunVersion,
      `${path}.createdAtPayRunVersion`,
      1,
    ),
    intentDigest: string(record.intentDigest, `${path}.intentDigest`),
    policyDecisionId: string(record.policyDecisionId, `${path}.policyDecisionId`),
    policyId: string(record.policyId, `${path}.policyId`),
    policyVersion: integer(record.policyVersion, `${path}.policyVersion`, 1),
    policyChecksum: string(record.policyChecksum, `${path}.policyChecksum`),
    policyEvaluationDigest: string(
      record.policyEvaluationDigest,
      `${path}.policyEvaluationDigest`,
    ),
    agentId: string(record.agentId, `${path}.agentId`),
    merchantId: string(record.merchantId, `${path}.merchantId`),
    purpose: string(record.purpose, `${path}.purpose`),
    amount: parseMoney(record.amount, `${path}.amount`),
    amountCeiling: parseMoney(record.amountCeiling, `${path}.amountCeiling`),
    settlementTarget: parseLogicalTarget(record.settlementTarget, `${path}.settlementTarget`),
    rail: string(record.rail, `${path}.rail`),
    fundingScopeDigest: string(record.fundingScopeDigest, `${path}.fundingScopeDigest`),
    coveredReasonCodes: array(record.coveredReasonCodes, `${path}.coveredReasonCodes`, string),
    approvalScopeDigest: string(record.approvalScopeDigest, `${path}.approvalScopeDigest`),
    generation: integer(record.generation, `${path}.generation`, 1),
    requester: {
      actorId: string(requester.actorId, `${path}.requester.actorId`),
      actorType: enumeration(requester.actorType, `${path}.requester.actorType`, [
        "agent", "user", "system", "worker",
      ] as const),
    },
  };
}

function parseApprovalDecision(value: unknown, path: string): ApprovalDecision {
  const record = object(value, path, [
    "id",
    "projectId",
    "approvalId",
    "payRunId",
    "outcome",
    "reviewerId",
    "approver",
    "decidedAt",
    "reasonCode",
    "approvalScopeDigest",
  ]);
  const approver = object(record.approver, `${path}.approver`, ["actorId", "actorType"]);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    approvalId: string(record.approvalId, `${path}.approvalId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    outcome: enumeration(record.outcome, `${path}.outcome`, ["approved", "denied"] as const),
    reviewerId: string(record.reviewerId, `${path}.reviewerId`),
    approver: {
      actorId: string(approver.actorId, `${path}.approver.actorId`),
      actorType: enumeration(approver.actorType, `${path}.approver.actorType`, [
        "agent", "user", "system", "worker",
      ] as const),
    },
    decidedAt: timestamp(record.decidedAt, `${path}.decidedAt`),
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    approvalScopeDigest: string(record.approvalScopeDigest, `${path}.approvalScopeDigest`),
  };
}

function parseApproval(value: unknown, path: string): Approval {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "payRunId",
    "status",
    "request",
    "decision",
    "createdAt",
    "updatedAt",
  ]);
  const decision = optional(record, "decision", path, parseApprovalDecision);
  return {
    ...parseAggregateMeta(record, path),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    status: enumeration(record.status, `${path}.status`, [
      "pending",
      "approved",
      "denied",
      "expired",
    ] as const),
    request: parseApprovalRequest(record.request, `${path}.request`),
    ...(decision ? { decision } : {}),
  };
}

function parseBudgetReservation(value: unknown, path: string): BudgetReservation {
  const record = object(value, path, [
    "id", "projectId", "version", "payRunId", "agentId", "merchantId", "rail",
    "scopeGeneration", "policyDecisionId", "policyId", "policyVersion", "policyChecksum",
    "policyEvaluationDigest", "intentDigest", "approvalScopeDigest", "approvalDecisionId",
    "fundingScopeDigest", "budgetKeys", "reservedAmount", "environment", "expiresAt",
    "status", "terminalReasonCode", "terminalEvidence", "createdAt", "updatedAt",
  ]);
  const status = enumeration(record.status, `${path}.status`, BUDGET_RESERVATION_STATUS_VALUES);
  const terminalEvidence = record.terminalEvidence === null
    ? null
    : status === "consumed"
      ? (() => {
          const evidence = object(record.terminalEvidence, `${path}.terminalEvidence`, ["ledgerJournalId"]);
          return { ledgerJournalId: string(evidence.ledgerJournalId, `${path}.terminalEvidence.ledgerJournalId`) };
        })()
      : parseEvidence(record.terminalEvidence, `${path}.terminalEvidence`);
  const result: BudgetReservation = {
    ...parseAggregateMeta(record, path),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    agentId: string(record.agentId, `${path}.agentId`),
    merchantId: string(record.merchantId, `${path}.merchantId`),
    rail: string(record.rail, `${path}.rail`),
    scopeGeneration: integer(record.scopeGeneration, `${path}.scopeGeneration`, 1),
    policyDecisionId: string(record.policyDecisionId, `${path}.policyDecisionId`),
    policyId: string(record.policyId, `${path}.policyId`),
    policyVersion: integer(record.policyVersion, `${path}.policyVersion`, 1),
    policyChecksum: string(record.policyChecksum, `${path}.policyChecksum`),
    policyEvaluationDigest: string(record.policyEvaluationDigest, `${path}.policyEvaluationDigest`),
    intentDigest: string(record.intentDigest, `${path}.intentDigest`),
    approvalScopeDigest: record.approvalScopeDigest === null ? null : string(record.approvalScopeDigest, `${path}.approvalScopeDigest`),
    approvalDecisionId: record.approvalDecisionId === null ? null : string(record.approvalDecisionId, `${path}.approvalDecisionId`),
    fundingScopeDigest: string(record.fundingScopeDigest, `${path}.fundingScopeDigest`),
    budgetKeys: array(record.budgetKeys, `${path}.budgetKeys`, string),
    reservedAmount: parseMoney(record.reservedAmount, `${path}.reservedAmount`),
    environment: enumeration(record.environment, `${path}.environment`, ["sandbox", "live_guarded"] as const),
    expiresAt: timestamp(record.expiresAt, `${path}.expiresAt`),
    status,
    terminalReasonCode: record.terminalReasonCode === null ? null : string(record.terminalReasonCode, `${path}.terminalReasonCode`),
    terminalEvidence,
  };
  if (new Set(result.budgetKeys).size !== result.budgetKeys.length) {
    throw validationError(`${path}.budgetKeys`, "budget keys must be unique", result.budgetKeys);
  }
  if (status === "active" && (result.terminalReasonCode !== null || result.terminalEvidence !== null)) {
    throw validationError(path, "active reservation cannot contain terminal evidence", value);
  }
  if (status !== "active" && (!result.terminalReasonCode || !result.terminalEvidence)) {
    throw validationError(path, "terminal reservation requires reason and evidence", value);
  }
  return result;
}

function parseEvidence(value: unknown, path: string): EvidenceReference {
  const record = object(value, path, [
    "environment",
    "kind",
    "provider",
    "reference",
    "observedStatus",
    "checksum",
    "capturedAt",
    "verificationMethod",
    "synthetic",
    "transactionHash",
  ]);
  const result: EvidenceReference = {
    environment: enumeration(record.environment, `${path}.environment`, [
      "sandbox",
      "live_guarded",
    ] as const),
    kind: enumeration(record.kind, `${path}.kind`, EVIDENCE_KINDS),
    provider: string(record.provider, `${path}.provider`),
    reference: string(record.reference, `${path}.reference`),
    observedStatus: string(record.observedStatus, `${path}.observedStatus`),
    checksum: string(record.checksum, `${path}.checksum`),
    capturedAt: timestamp(record.capturedAt, `${path}.capturedAt`),
    verificationMethod: string(record.verificationMethod, `${path}.verificationMethod`),
    synthetic: boolean(record.synthetic, `${path}.synthetic`),
    transactionHash: nullableString(record.transactionHash, `${path}.transactionHash`),
  };
  try {
    assertEvidenceCompatible(result.environment, result);
  } catch {
    throw validationError(path, "evidence namespace does not match its environment", value);
  }
  return result;
}

function requireEvidenceKind(
  evidence: EvidenceReference,
  path: string,
  allowedKinds: readonly string[],
): void {
  if (!allowedKinds.includes(evidence.kind)) {
    throw validationError(
      `${path}.kind`,
      `evidence kind must be one of: ${allowedKinds.join(", ")}`,
      evidence.kind,
    );
  }
}

function parseFundingProof(value: unknown, path: string): FundingProof {
  const evidence = parseEvidence(value, path);
  requireEvidenceKind(evidence, path, [
    "sandbox_funding_evidence",
    "guarded_funding_evidence",
  ]);
  return evidence as FundingProof;
}

function parsePaymentProof(value: unknown, path: string): PaymentProof {
  const evidence = parseEvidence(value, path);
  requireEvidenceKind(evidence, path, [
    "sandbox_payment_evidence",
    "guarded_payment_evidence",
  ]);
  return evidence as PaymentProof;
}

function parseNoTransferProof(value: unknown, path: string): NoTransferProof {
  const evidence = parseEvidence(value, path);
  requireEvidenceKind(evidence, path, [
    "sandbox_no_transfer_evidence",
    "guarded_no_transfer_evidence",
  ]);
  return evidence as NoTransferProof;
}

function parseExecutionEvidence(value: unknown, path: string) {
  const evidence = parseEvidence(value, path);
  requireEvidenceKind(evidence, path, [
    "sandbox_execution_proof",
    "guarded_execution_proof",
  ]);
  return evidence as CanonicalExecutionProof["evidence"];
}

function parseFundingRouteStep(value: unknown, path: string): FundingRouteStep {
  const record = object(value, path, [
    "sequence",
    "action",
    "from",
    "to",
    "description",
    "simulated",
  ]);
  return {
    sequence: integer(record.sequence, `${path}.sequence`, 1),
    action: enumeration(record.action, `${path}.action`, ["swap", "bridge"] as const),
    from: string(record.from, `${path}.from`),
    to: string(record.to, `${path}.to`),
    description: string(record.description, `${path}.description`),
    simulated: boolean(record.simulated, `${path}.simulated`),
  };
}

function parseFundingAttempt(value: unknown, path: string): FundingAttempt {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "fundingPreparationId",
    "executionKey",
    "planDigest",
    "outcome",
    "createdAt",
    "evidence",
  ]);
  const rawEvidence = optional(record, "evidence", path, parseEvidence);
  if (rawEvidence) {
    requireEvidenceKind(rawEvidence, `${path}.evidence`, [
      "sandbox_funding_evidence",
      "guarded_funding_evidence",
      "sandbox_no_transfer_evidence",
      "guarded_no_transfer_evidence",
    ]);
  }
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    fundingPreparationId: string(
      record.fundingPreparationId,
      `${path}.fundingPreparationId`,
    ),
    executionKey: string(record.executionKey, `${path}.executionKey`),
    planDigest: string(record.planDigest, `${path}.planDigest`),
    outcome: enumeration(record.outcome, `${path}.outcome`, [
      "prepared",
      "submitted",
      "unknown",
      "final_success",
      "final_failure",
    ] as const),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    ...(rawEvidence
      ? { evidence: rawEvidence as FundingProof | NoTransferProof }
      : {}),
  };
}

function parseFundingPreparation(
  value: unknown,
  path: string,
): CanonicalFundingPreparation {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "payRunId",
    "budgetReservationId",
    "intentDigest",
    "policyDecisionId",
    "approvedScopeDigest",
    "idempotencyKey",
    "source",
    "requiredTarget",
    "requestedAmount",
    "action",
    "route",
    "attempts",
    "status",
    "planDigest",
    "quoteReference",
    "expiresAt",
    "evidence",
    "transactionHash",
    "realFundsAvailable",
    "realBridgeCapability",
    "createdAt",
    "updatedAt",
  ]);
  const evidence = optional(record, "evidence", path, parseFundingProof);
  const attempts = array(record.attempts, `${path}.attempts`, parseFundingAttempt);
  return {
    ...parseAggregateMeta(record, path),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    budgetReservationId: string(record.budgetReservationId, `${path}.budgetReservationId`),
    intentDigest: string(record.intentDigest, `${path}.intentDigest`),
    policyDecisionId: string(record.policyDecisionId, `${path}.policyDecisionId`),
    approvedScopeDigest: string(record.approvedScopeDigest, `${path}.approvedScopeDigest`),
    idempotencyKey: string(record.idempotencyKey, `${path}.idempotencyKey`),
    source: parseFundingSource(record.source, `${path}.source`),
    requiredTarget: parseLogicalTarget(record.requiredTarget, `${path}.requiredTarget`),
    requestedAmount: parseMoney(record.requestedAmount, `${path}.requestedAmount`),
    action: enumeration(record.action, `${path}.action`, [
      "none",
      "swap",
      "bridge",
      "swap_and_bridge",
    ] as const),
    route: array(record.route, `${path}.route`, parseFundingRouteStep),
    attempts,
    status: enumeration(record.status, `${path}.status`, [
      "requested",
      "not_required",
      "planned",
      "sandbox_prepared",
      "prepared",
      "unsupported",
      "failed",
      "expired",
    ] as const),
    planDigest: string(record.planDigest, `${path}.planDigest`),
    quoteReference: nullableString(record.quoteReference, `${path}.quoteReference`),
    expiresAt: timestamp(record.expiresAt, `${path}.expiresAt`),
    ...(evidence ? { evidence } : {}),
    transactionHash: nullableString(record.transactionHash, `${path}.transactionHash`),
    realFundsAvailable: boolean(record.realFundsAvailable, `${path}.realFundsAvailable`),
    realBridgeCapability: boolean(record.realBridgeCapability, `${path}.realBridgeCapability`),
  };
}

function parsePaymentInstruction(value: unknown, path: string): PaymentInstruction {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "fundingPreparationId",
    "merchantId",
    "rail",
    "amount",
    "target",
    "instructionHash",
    "executionKey",
    "createdAt",
  ]);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    fundingPreparationId: string(
      record.fundingPreparationId,
      `${path}.fundingPreparationId`,
    ),
    merchantId: string(record.merchantId, `${path}.merchantId`),
    rail: string(record.rail, `${path}.rail`),
    amount: parseMoney(record.amount, `${path}.amount`),
    target: parseLogicalTarget(record.target, `${path}.target`),
    instructionHash: string(record.instructionHash, `${path}.instructionHash`),
    executionKey: string(record.executionKey, `${path}.executionKey`),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
  };
}

function parseExecutionAttempt(value: unknown, path: string): ExecutionAttempt {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "paymentExecutionId",
    "executionKey",
    "instructionHash",
    "outcome",
    "createdAt",
  ]);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    paymentExecutionId: string(record.paymentExecutionId, `${path}.paymentExecutionId`),
    executionKey: string(record.executionKey, `${path}.executionKey`),
    instructionHash: string(record.instructionHash, `${path}.instructionHash`),
    outcome: enumeration(record.outcome, `${path}.outcome`, [
      "prepared",
      "submitted",
      "unknown",
      "final_success",
      "final_failure",
    ] as const),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
  };
}

function parsePaymentExecution(value: unknown, path: string): PaymentExecution {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "payRunId",
    "instruction",
    "status",
    "providerReference",
    "evidence",
    "reconciliationState",
    "attempts",
    "createdAt",
    "updatedAt",
  ]);
  const status = enumeration(record.status, `${path}.status`, [
    "prepared",
    "submitted",
    "succeeded",
    "unknown",
    "failed_no_transfer",
  ] as const);
  const evidence =
    record.evidence === undefined
      ? undefined
      : status === "failed_no_transfer"
        ? parseNoTransferProof(record.evidence, `${path}.evidence`)
        : parsePaymentProof(record.evidence, `${path}.evidence`);
  const result: CanonicalPaymentExecution = {
    ...parseAggregateMeta(record, path),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    instruction: parsePaymentInstruction(record.instruction, `${path}.instruction`),
    status,
    providerReference: nullableString(record.providerReference, `${path}.providerReference`),
    ...(evidence ? { evidence } : {}),
    reconciliationState: enumeration(record.reconciliationState, `${path}.reconciliationState`, [
      "not_required",
      "scheduled",
      "reconciling",
      "resolved",
    ] as const),
    attempts: array(record.attempts, `${path}.attempts`, parseExecutionAttempt),
  };
  return result;
}

function parseProofRequest(value: unknown, path: string): ExecutionProofRequest {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "paymentExecutionId",
    "artifactType",
    "provider",
    "createdAt",
  ]);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    paymentExecutionId: string(record.paymentExecutionId, `${path}.paymentExecutionId`),
    artifactType: string(record.artifactType, `${path}.artifactType`),
    provider: string(record.provider, `${path}.provider`),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
  };
}

function parseArtifactProof(value: unknown, path: string): ArtifactProof {
  const record = object(value, path, [
    "projectId",
    "payRunId",
    "paymentExecutionId",
    "requestId",
    "provider",
    "artifactType",
    "artifactReference",
    "checksum",
    "verificationStatus",
    "capturedAt",
  ]);
  return {
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    paymentExecutionId: string(
      record.paymentExecutionId,
      `${path}.paymentExecutionId`,
    ),
    requestId: string(record.requestId, `${path}.requestId`),
    provider: string(record.provider, `${path}.provider`),
    artifactType: string(record.artifactType, `${path}.artifactType`),
    artifactReference: string(
      record.artifactReference,
      `${path}.artifactReference`,
    ),
    checksum: string(record.checksum, `${path}.checksum`),
    verificationStatus: enumeration(
      record.verificationStatus,
      `${path}.verificationStatus`,
      ["verified", "unverified"] as const,
    ),
    capturedAt: timestamp(record.capturedAt, `${path}.capturedAt`),
  };
}

function sameArtifactProof(left: ArtifactProof, right: ArtifactProof): boolean {
  return (
    left.projectId === right.projectId &&
    left.payRunId === right.payRunId &&
    left.paymentExecutionId === right.paymentExecutionId &&
    left.requestId === right.requestId &&
    left.provider === right.provider &&
    left.artifactType === right.artifactType &&
    left.artifactReference === right.artifactReference &&
    left.checksum === right.checksum &&
    left.verificationStatus === right.verificationStatus &&
    left.capturedAt === right.capturedAt
  );
}

function parseExecutionProof(
  value: unknown,
  path: string,
): CanonicalExecutionProof {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "paymentExecutionId",
    "requestId",
    "provider",
    "artifactType",
    "artifactReference",
    "checksum",
    "verificationStatus",
    "outcome",
    "evidence",
    "capturedAt",
    "artifactProof",
  ]);
  const result: ExecutionProof = {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    paymentExecutionId: string(record.paymentExecutionId, `${path}.paymentExecutionId`),
    requestId: string(record.requestId, `${path}.requestId`),
    provider: string(record.provider, `${path}.provider`),
    artifactType: string(record.artifactType, `${path}.artifactType`),
    artifactReference: string(record.artifactReference, `${path}.artifactReference`),
    checksum: string(record.checksum, `${path}.checksum`),
    verificationStatus: enumeration(record.verificationStatus, `${path}.verificationStatus`, [
      "verified",
      "unverified",
    ] as const),
    outcome: enumeration(record.outcome, `${path}.outcome`, ["positive", "negative"] as const),
    evidence: parseExecutionEvidence(record.evidence, `${path}.evidence`),
    capturedAt: timestamp(record.capturedAt, `${path}.capturedAt`),
  };
  const derivedArtifactProof: ArtifactProof = {
    projectId: result.projectId,
    payRunId: result.payRunId,
    paymentExecutionId: result.paymentExecutionId,
    requestId: result.requestId,
    provider: result.provider,
    artifactType: result.artifactType,
    artifactReference: result.artifactReference,
    checksum: result.checksum,
    verificationStatus: result.verificationStatus,
    capturedAt: result.capturedAt,
  };
  const artifactProof =
    record.artifactProof === undefined
      ? derivedArtifactProof
      : parseArtifactProof(record.artifactProof, `${path}.artifactProof`);
  if (!sameArtifactProof(artifactProof, derivedArtifactProof)) {
    throw validationError(
      `${path}.artifactProof`,
      "ArtifactProof must match the ExecutionProof artifact fields",
      record.artifactProof,
    );
  }
  return {
    ...result,
    evidence: result.evidence as CanonicalExecutionProof["evidence"],
    artifactProof,
  };
}

function parseLedgerEntry(value: unknown, path: string): LedgerEntry {
  const record = object(value, path, [
    "id",
    "projectId",
    "journalId",
    "accountId",
    "accountRole",
    "debitAtomic",
    "creditAtomic",
    "evidenceHash",
  ]);
  try {
    assertAtomicAmount(record.debitAtomic, `${path}.debitAtomic`);
    assertAtomicAmount(record.creditAtomic, `${path}.creditAtomic`);
  } catch {
    throw validationError(path, "invalid Ledger atomic amount", value);
  }
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    journalId: string(record.journalId, `${path}.journalId`),
    accountId: string(record.accountId, `${path}.accountId`),
    accountRole: string(record.accountRole, `${path}.accountRole`),
    debitAtomic: record.debitAtomic,
    creditAtomic: record.creditAtomic,
    evidenceHash: string(record.evidenceHash, `${path}.evidenceHash`),
  };
}

function parseLedgerDraft(value: unknown, path: string): LedgerDraft {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "paymentExecutionId",
    "executionProofId",
    "environment",
    "assetRef",
    "externalReference",
    "evidenceHash",
    "entries",
    "preparedAt",
  ]);
  const result: LedgerDraft = {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    paymentExecutionId: string(record.paymentExecutionId, `${path}.paymentExecutionId`),
    executionProofId: string(record.executionProofId, `${path}.executionProofId`),
    environment: enumeration(record.environment, `${path}.environment`, [
      "sandbox",
      "live_guarded",
    ] as const),
    assetRef: parseSettlementRef(record.assetRef, `${path}.assetRef`),
    externalReference: string(record.externalReference, `${path}.externalReference`),
    evidenceHash: string(record.evidenceHash, `${path}.evidenceHash`),
    entries: array(record.entries, `${path}.entries`, parseLedgerEntry),
    preparedAt: timestamp(record.preparedAt, `${path}.preparedAt`),
  };
  try {
    assertLedgerBalanced(result);
  } catch {
    throw validationError(path, "Ledger draft is not balanced", value);
  }
  return result;
}

function parseLedgerJournal(value: unknown, path: string): LedgerJournal {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "payRunId",
    "paymentExecutionId",
    "executionProofId",
    "environment",
    "assetRef",
    "externalReference",
    "evidenceHash",
    "entries",
    "committedAt",
    "reversalOfJournalId",
    "createdAt",
    "updatedAt",
  ]);
  const reversal = optional(record, "reversalOfJournalId", path, string);
  const result: LedgerJournal = {
    ...parseAggregateMeta(record, path),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    paymentExecutionId: string(record.paymentExecutionId, `${path}.paymentExecutionId`),
    executionProofId: string(record.executionProofId, `${path}.executionProofId`),
    environment: enumeration(record.environment, `${path}.environment`, [
      "sandbox",
      "live_guarded",
    ] as const),
    assetRef: parseSettlementRef(record.assetRef, `${path}.assetRef`),
    externalReference: string(record.externalReference, `${path}.externalReference`),
    evidenceHash: string(record.evidenceHash, `${path}.evidenceHash`),
    entries: array(record.entries, `${path}.entries`, parseLedgerEntry),
    committedAt: timestamp(record.committedAt, `${path}.committedAt`),
    ...(reversal ? { reversalOfJournalId: reversal } : {}),
  };
  try {
    assertLedgerBalanced(result);
  } catch {
    throw validationError(path, "Ledger journal is not balanced", value);
  }
  return result;
}

function parseExpiry(value: unknown, path: string): ExpiryRecord {
  const record = object(value, path, [
    "expiredAtStage",
    "reasonCode",
    "expiredAt",
    "evidence",
    "externalEffectPossible",
    "safeReleaseEvidence",
  ]);
  const safeReleaseEvidence = optional(record, "safeReleaseEvidence", path, parseEvidence);
  return {
    expiredAtStage: enumeration(record.expiredAtStage, `${path}.expiredAtStage`, PAY_RUN_STATUS_VALUES),
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    expiredAt: timestamp(record.expiredAt, `${path}.expiredAt`),
    evidence: parseEvidence(record.evidence, `${path}.evidence`),
    externalEffectPossible: boolean(record.externalEffectPossible, `${path}.externalEffectPossible`),
    ...(safeReleaseEvidence ? { safeReleaseEvidence } : {}),
  };
}

function parseCancellation(value: unknown, path: string): CancellationRecord {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "status",
    "requestedBy",
    "requestedAt",
    "externalEffectPossible",
    "reasonCode",
    "completedAt",
    "safeReleaseEvidence",
  ]);
  const completedAt = optional(record, "completedAt", path, timestamp);
  const safeReleaseEvidence = optional(record, "safeReleaseEvidence", path, parseEvidence);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    status: enumeration(record.status, `${path}.status`, ["pending", "cancelled"] as const),
    requestedBy: string(record.requestedBy, `${path}.requestedBy`),
    requestedAt: timestamp(record.requestedAt, `${path}.requestedAt`),
    externalEffectPossible: boolean(record.externalEffectPossible, `${path}.externalEffectPossible`),
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    ...(completedAt ? { completedAt } : {}),
    ...(safeReleaseEvidence ? { safeReleaseEvidence } : {}),
  };
}

function parseFailure(value: unknown, path: string): FailureRecord {
  const record = object(value, path, [
    "stage",
    "reasonCode",
    "failedAt",
    "externalEffectAttempted",
    "noValueMovedEvidence",
  ]);
  const evidence = optional(record, "noValueMovedEvidence", path, parseEvidence);
  return {
    stage: enumeration(record.stage, `${path}.stage`, PAY_RUN_STATUS_VALUES),
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    failedAt: timestamp(record.failedAt, `${path}.failedAt`),
    externalEffectAttempted: boolean(
      record.externalEffectAttempted,
      `${path}.externalEffectAttempted`,
    ),
    ...(evidence ? { noValueMovedEvidence: evidence } : {}),
  };
}

function parsePayRun(value: unknown, path: string): PayRun {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "environment",
    "status",
    "creationIdempotencyKey",
    "supersedesPayRunId",
    "intent",
    "intentDigest",
    "policyEvaluation",
    "policyDecisions",
    "approval",
    "fundingPreparation",
    "paymentExecution",
    "proofRequest",
    "executionProof",
    "ledgerDraft",
    "ledgerJournal",
    "expiry",
    "cancellation",
    "failure",
    "lastAuditSequence",
    "lastOutboxSequence",
    "createdAt",
    "updatedAt",
  ]);
  const supersedesPayRunId = optional(record, "supersedesPayRunId", path, string);
  const policyEvaluation = optional(record, "policyEvaluation", path, parsePolicyEvaluationAttempt);
  const approval = optional(record, "approval", path, parseApproval);
  const fundingPreparation = optional(record, "fundingPreparation", path, parseFundingPreparation);
  const paymentExecution = optional(record, "paymentExecution", path, parsePaymentExecution);
  const proofRequest = optional(record, "proofRequest", path, parseProofRequest);
  const executionProof = optional(record, "executionProof", path, parseExecutionProof);
  const ledgerDraft = optional(record, "ledgerDraft", path, parseLedgerDraft);
  const ledgerJournal = optional(record, "ledgerJournal", path, parseLedgerJournal);
  const expiry = optional(record, "expiry", path, parseExpiry);
  const cancellation = optional(record, "cancellation", path, parseCancellation);
  const failure = optional(record, "failure", path, parseFailure);
  const result: PayRun = {
    ...parseAggregateMeta(record, path),
    environment: enumeration(record.environment, `${path}.environment`, [
      "sandbox",
      "live_guarded",
    ] as const),
    status: enumeration(record.status, `${path}.status`, PAY_RUN_STATUS_VALUES),
    creationIdempotencyKey: string(
      record.creationIdempotencyKey,
      `${path}.creationIdempotencyKey`,
    ),
    ...(supersedesPayRunId ? { supersedesPayRunId } : {}),
    intent: parsePayIntent(record.intent, `${path}.intent`),
    intentDigest: string(record.intentDigest, `${path}.intentDigest`),
    ...(policyEvaluation ? { policyEvaluation } : {}),
    policyDecisions: array(record.policyDecisions, `${path}.policyDecisions`, parsePolicyDecision),
    ...(approval ? { approval } : {}),
    ...(fundingPreparation ? { fundingPreparation } : {}),
    ...(paymentExecution ? { paymentExecution } : {}),
    ...(proofRequest ? { proofRequest } : {}),
    ...(executionProof ? { executionProof } : {}),
    ...(ledgerDraft ? { ledgerDraft } : {}),
    ...(ledgerJournal ? { ledgerJournal } : {}),
    ...(expiry ? { expiry } : {}),
    ...(cancellation ? { cancellation } : {}),
    ...(failure ? { failure } : {}),
    lastAuditSequence: integer(record.lastAuditSequence, `${path}.lastAuditSequence`),
    lastOutboxSequence: integer(record.lastOutboxSequence, `${path}.lastOutboxSequence`),
  };
  try {
    assertPayRunInvariants(result);
  } catch (error) {
    throw validationError(path, error instanceof Error ? error.message : "PayRun invariant failed", value);
  }
  return result;
}

function parseAuditEvent(value: unknown, path: string): AuditEvent {
  const record = object(value, path, [
    "id",
    "projectId",
    "payRunId",
    "aggregateType",
    "aggregateId",
    "sequence",
    "beforeVersion",
    "afterVersion",
    "actor",
    "actionCode",
    "reasonCode",
    "idempotencyKey",
    "correlationId",
    "occurredAt",
    "details",
  ]);
  const actor = object(record.actor, `${path}.actor`, ["actorId", "actorType"]);
  if (record.aggregateType !== "PayRun") {
    throw validationError(`${path}.aggregateType`, "expected PayRun", record.aggregateType);
  }
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    payRunId: string(record.payRunId, `${path}.payRunId`),
    aggregateType: "PayRun",
    aggregateId: string(record.aggregateId, `${path}.aggregateId`),
    sequence: integer(record.sequence, `${path}.sequence`, 1),
    beforeVersion: integer(record.beforeVersion, `${path}.beforeVersion`),
    afterVersion: integer(record.afterVersion, `${path}.afterVersion`, 1),
    actor: {
      actorId: string(actor.actorId, `${path}.actor.actorId`),
      actorType: enumeration(actor.actorType, `${path}.actor.actorType`, [
        "agent",
        "user",
        "system",
        "worker",
      ] as const),
    },
    actionCode: string(record.actionCode, `${path}.actionCode`),
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    idempotencyKey: string(record.idempotencyKey, `${path}.idempotencyKey`),
    correlationId: string(record.correlationId, `${path}.correlationId`),
    occurredAt: timestamp(record.occurredAt, `${path}.occurredAt`),
    details: parseJsonRecord(record.details, `${path}.details`),
  };
}

function parseOutboxEvent(value: unknown, path: string): DomainOutboxEvent {
  const record = object(value, path, [
    "id",
    "projectId",
    "aggregateType",
    "aggregateId",
    "aggregateVersion",
    "sequence",
    "eventType",
    "schemaVersion",
    "payload",
    "occurredAt",
  ]);
  if (record.aggregateType !== "PayRun") {
    throw validationError(`${path}.aggregateType`, "expected PayRun", record.aggregateType);
  }
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    aggregateType: "PayRun",
    aggregateId: string(record.aggregateId, `${path}.aggregateId`),
    aggregateVersion: integer(record.aggregateVersion, `${path}.aggregateVersion`, 1),
    sequence: integer(record.sequence, `${path}.sequence`, 1),
    eventType: enumeration(record.eventType, `${path}.eventType`, [
      "payrun.created",
      "payrun.transitioned",
    ] as const),
    schemaVersion: integer(record.schemaVersion, `${path}.schemaVersion`, 1),
    payload: parseJsonRecord(record.payload, `${path}.payload`),
    occurredAt: timestamp(record.occurredAt, `${path}.occurredAt`),
  };
}

function parseIdempotencyRecord(value: unknown, path: string): IdempotencyRecord {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "commandType",
    "key",
    "requestHash",
    "state",
    "resultResourceId",
    "resultVersion",
    "responseStatus",
    "retentionUntil",
    "createdAt",
    "updatedAt",
  ]);
  return {
    ...parseAggregateMeta(record, path),
    commandType: string(record.commandType, `${path}.commandType`),
    key: string(record.key, `${path}.key`),
    requestHash: string(record.requestHash, `${path}.requestHash`),
    state: enumeration(record.state, `${path}.state`, [
      "in_progress",
      "completed",
      "unknown",
    ] as const),
    resultResourceId:
      record.resultResourceId === null
        ? null
        : string(record.resultResourceId, `${path}.resultResourceId`),
    resultVersion:
      record.resultVersion === null
        ? null
        : integer(record.resultVersion, `${path}.resultVersion`, 1),
    responseStatus:
      record.responseStatus === null
        ? null
        : integer(record.responseStatus, `${path}.responseStatus`, 100),
    retentionUntil: timestamp(record.retentionUntil, `${path}.retentionUntil`),
  };
}

function parseInboxEvent(value: unknown, path: string): InboxEvent {
  const record = object(value, path, [
    "id",
    "projectId",
    "version",
    "source",
    "sourceEventId",
    "status",
    "payloadDigest",
    "consumedAt",
    "createdAt",
    "updatedAt",
  ]);
  const status = enumeration(record.status, `${path}.status`, ["received", "consumed"] as const);
  const consumedAt =
    record.consumedAt === undefined ? undefined : timestamp(record.consumedAt, `${path}.consumedAt`);
  if (status === "received" && consumedAt !== undefined) {
    throw validationError(`${path}.consumedAt`, "received event cannot be consumed", consumedAt);
  }
  if (status === "consumed" && consumedAt === undefined) {
    throw validationError(`${path}.consumedAt`, "consumed event requires a timestamp", consumedAt);
  }
  return {
    ...parseAggregateMeta(record, path),
    source: string(record.source, `${path}.source`),
    sourceEventId: string(record.sourceEventId, `${path}.sourceEventId`),
    status,
    payloadDigest: string(record.payloadDigest, `${path}.payloadDigest`),
    ...(consumedAt === undefined ? {} : { consumedAt }),
  };
}

function parseSimpleAggregate<T extends Project | Agent | Merchant | Policy>(
  value: unknown,
  path: string,
  keys: readonly string[],
  build: (record: Record<string, unknown>) => T,
): T {
  const record = object(value, path, keys);
  return build(record);
}

function parsePolicyBudgetSnapshot(
  value: unknown,
  path: string,
): PolicyBudgetSnapshot {
  const record = object(value, path, [
    "projectRemaining",
    "agentRemaining",
    "merchantRemaining",
  ]);
  return {
    projectRemaining: parseMoney(
      record.projectRemaining,
      `${path}.projectRemaining`,
    ),
    agentRemaining: parseMoney(record.agentRemaining, `${path}.agentRemaining`),
    merchantRemaining: parseMoney(
      record.merchantRemaining,
      `${path}.merchantRemaining`,
    ),
  };
}

function parsePaymentQuote(value: unknown, path: string): PaymentQuote {
  const record = object(value, path, [
    "id",
    "projectId",
    "merchantId",
    "provider",
    "rail",
    "amount",
    "fee",
    "configurationVersion",
    "quotedAt",
    "expiresAt",
  ]);
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    merchantId: string(record.merchantId, `${path}.merchantId`),
    provider: string(record.provider, `${path}.provider`),
    rail: string(record.rail, `${path}.rail`),
    amount: parseMoney(record.amount, `${path}.amount`),
    fee: parseMoney(record.fee, `${path}.fee`),
    configurationVersion: string(
      record.configurationVersion,
      `${path}.configurationVersion`,
    ),
    quotedAt: timestamp(record.quotedAt, `${path}.quotedAt`),
    expiresAt: timestamp(record.expiresAt, `${path}.expiresAt`),
  };
}

function parseFundingPreflightQuote(
  value: unknown,
  path: string,
): FundingPreflightQuote {
  const record = object(value, path, [
    "id",
    "projectId",
    "planDigest",
    "provider",
    "source",
    "target",
    "requestedAmount",
    "estimatedFee",
    "configurationVersion",
    "quotedAt",
    "expiresAt",
    "readOnly",
  ]);
  if (record.readOnly !== true) {
    throw validationError(
      `${path}.readOnly`,
      "Funding preflight quote must be read-only",
      record.readOnly,
    );
  }
  return {
    id: string(record.id, `${path}.id`),
    projectId: string(record.projectId, `${path}.projectId`),
    planDigest: string(record.planDigest, `${path}.planDigest`),
    provider: string(record.provider, `${path}.provider`),
    source: parseFundingSource(record.source, `${path}.source`),
    target: parseLogicalTarget(record.target, `${path}.target`),
    requestedAmount: parseMoney(
      record.requestedAmount,
      `${path}.requestedAmount`,
    ),
    estimatedFee: parseMoney(record.estimatedFee, `${path}.estimatedFee`),
    configurationVersion: string(
      record.configurationVersion,
      `${path}.configurationVersion`,
    ),
    quotedAt: timestamp(record.quotedAt, `${path}.quotedAt`),
    expiresAt: timestamp(record.expiresAt, `${path}.expiresAt`),
    readOnly: true,
  };
}

export const moneySchema = defineSchema(parseMoney);
export const payIntentSchema = defineSchema(parsePayIntent);
export const policyDecisionSchema = defineSchema(parsePolicyDecision);
export const approvalSchema = defineSchema(parseApproval);
export const budgetReservationSchema = defineSchema(parseBudgetReservation);
export const evidenceReferenceSchema = defineSchema(parseEvidence);
export const fundingProofSchema = defineSchema(parseFundingProof);
export const paymentProofSchema = defineSchema(parsePaymentProof);
export const artifactProofSchema = defineSchema(parseArtifactProof);
export const fundingPreparationSchema = defineSchema(parseFundingPreparation);
export const paymentExecutionSchema = defineSchema(parsePaymentExecution);
export const executionProofSchema = defineSchema(parseExecutionProof);
export const ledgerJournalSchema = defineSchema(parseLedgerJournal);
export const auditEventSchema = defineSchema(parseAuditEvent);
export const domainOutboxEventSchema = defineSchema(parseOutboxEvent);
export const idempotencyRecordSchema = defineSchema(parseIdempotencyRecord);
export const inboxEventSchema = defineSchema(parseInboxEvent);
export const payRunSchema = defineSchema(parsePayRun);

export const projectSchema = defineSchema<Project>((value, path) =>
  parseSimpleAggregate(
    value,
    path,
    [
      "id",
      "projectId",
      "version",
      "createdAt",
      "updatedAt",
      "mode",
      "killSwitchActive",
      "defaultSettlementTarget",
    ],
    (record) => ({
      ...parseAggregateMeta(record, path),
      mode: enumeration(record.mode, `${path}.mode`, ["sandbox", "live_guarded"] as const),
      killSwitchActive: boolean(record.killSwitchActive, `${path}.killSwitchActive`),
      defaultSettlementTarget: parseLogicalTarget(
        record.defaultSettlementTarget,
        `${path}.defaultSettlementTarget`,
      ),
    }),
  ),
);

export const agentSchema = defineSchema<Agent>((value, path) =>
  parseSimpleAggregate(
    value,
    path,
    [
      "id",
      "projectId",
      "version",
      "createdAt",
      "updatedAt",
      "ownerId",
      "status",
      "policyId",
      "capabilities",
    ],
    (record) => ({
      ...parseAggregateMeta(record, path),
      ownerId: string(record.ownerId, `${path}.ownerId`),
      status: enumeration(record.status, `${path}.status`, ["active", "inactive", "blocked"] as const),
      policyId: string(record.policyId, `${path}.policyId`),
      capabilities: array(record.capabilities, `${path}.capabilities`, string),
    }),
  ),
);

export const merchantSchema = defineSchema<Merchant>((value, path) =>
  parseSimpleAggregate(
    value,
    path,
    [
      "id",
      "projectId",
      "version",
      "createdAt",
      "updatedAt",
      "payee",
      "category",
      "trustState",
      "settlementTarget",
    ],
    (record) => ({
      ...parseAggregateMeta(record, path),
      payee: string(record.payee, `${path}.payee`),
      category: string(record.category, `${path}.category`),
      trustState: enumeration(record.trustState, `${path}.trustState`, [
        "known",
        "new",
        "unknown",
        "blocked",
      ] as const),
      settlementTarget: parseLogicalTarget(record.settlementTarget, `${path}.settlementTarget`),
    }),
  ),
);

export const policySchema = defineSchema<Policy>((value, path) =>
  parseSimpleAggregate(
    value,
    path,
    [
      "id",
      "projectId",
      "version",
      "createdAt",
      "updatedAt",
      "policyVersion",
      "checksum",
      "effectiveFrom",
      "effectiveUntil",
      "active",
    ],
    (record) => ({
      ...parseAggregateMeta(record, path),
      policyVersion: integer(record.policyVersion, `${path}.policyVersion`, 1),
      checksum: string(record.checksum, `${path}.checksum`),
      effectiveFrom: timestamp(record.effectiveFrom, `${path}.effectiveFrom`),
      effectiveUntil:
        record.effectiveUntil === null
          ? null
          : timestamp(record.effectiveUntil, `${path}.effectiveUntil`),
      active: boolean(record.active, `${path}.active`),
    }),
  ),
);

export function serializePayRun(payRun: PayRun): string {
  return JSON.stringify(payRunSchema.parse(payRun));
}

export function deserializePayRun(serialized: string): PayRun {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new SchemaValidationError("PayRun JSON could not be parsed", { cause: error });
  }
  return payRunSchema.parse(value);
}

// These boundary schemas deliberately validate only command envelopes here;
// every nested artifact is parsed by the canonical artifact schemas above.
export const payRunTransitionCommandSchema = defineSchema<PayRunTransitionCommand>((value, path) => {
  const record = object(value, path, [
    "to",
    "expectedVersion",
    "occurredAt",
    "commandType",
    "idempotencyRecordId",
    "idempotencyKey",
    "requestHash",
    "idempotencyRetentionUntil",
    "auditEventId",
    "outboxEventId",
    "correlationId",
    "actor",
    "reasonCode",
    "data",
  ]);
  const actor = object(record.actor, `${path}.actor`, ["actorId", "actorType"]);
  const data = object(record.data, `${path}.data`, [
    "policyEvaluation",
    "policyDecision",
    "approval",
    "fundingPreparation",
    "paymentExecution",
    "proofRequest",
    "executionProof",
    "ledgerDraft",
    "ledgerJournal",
    "expiry",
    "cancellation",
    "failure",
  ]);
  return {
    to: enumeration(record.to, `${path}.to`, PAY_RUN_STATUS_VALUES),
    expectedVersion: integer(record.expectedVersion, `${path}.expectedVersion`, 1),
    occurredAt: timestamp(record.occurredAt, `${path}.occurredAt`),
    commandType: string(record.commandType, `${path}.commandType`),
    idempotencyRecordId: string(record.idempotencyRecordId, `${path}.idempotencyRecordId`),
    idempotencyKey: string(record.idempotencyKey, `${path}.idempotencyKey`),
    requestHash: string(record.requestHash, `${path}.requestHash`),
    idempotencyRetentionUntil: timestamp(
      record.idempotencyRetentionUntil,
      `${path}.idempotencyRetentionUntil`,
    ),
    auditEventId: string(record.auditEventId, `${path}.auditEventId`),
    outboxEventId: string(record.outboxEventId, `${path}.outboxEventId`),
    correlationId: string(record.correlationId, `${path}.correlationId`),
    actor: {
      actorId: string(actor.actorId, `${path}.actor.actorId`),
      actorType: enumeration(actor.actorType, `${path}.actor.actorType`, [
        "agent",
        "user",
        "system",
        "worker",
      ] as const),
    },
    reasonCode: string(record.reasonCode, `${path}.reasonCode`),
    data: {
      ...(data.policyEvaluation !== undefined
        ? { policyEvaluation: parsePolicyEvaluationAttempt(data.policyEvaluation, `${path}.data.policyEvaluation`) }
        : {}),
      ...(data.policyDecision !== undefined
        ? { policyDecision: parsePolicyDecision(data.policyDecision, `${path}.data.policyDecision`) }
        : {}),
      ...(data.approval !== undefined
        ? { approval: parseApproval(data.approval, `${path}.data.approval`) }
        : {}),
      ...(data.fundingPreparation !== undefined
        ? { fundingPreparation: parseFundingPreparation(data.fundingPreparation, `${path}.data.fundingPreparation`) }
        : {}),
      ...(data.paymentExecution !== undefined
        ? { paymentExecution: parsePaymentExecution(data.paymentExecution, `${path}.data.paymentExecution`) }
        : {}),
      ...(data.proofRequest !== undefined
        ? { proofRequest: parseProofRequest(data.proofRequest, `${path}.data.proofRequest`) }
        : {}),
      ...(data.executionProof !== undefined
        ? { executionProof: parseExecutionProof(data.executionProof, `${path}.data.executionProof`) }
        : {}),
      ...(data.ledgerDraft !== undefined
        ? { ledgerDraft: parseLedgerDraft(data.ledgerDraft, `${path}.data.ledgerDraft`) }
        : {}),
      ...(data.ledgerJournal !== undefined
        ? { ledgerJournal: parseLedgerJournal(data.ledgerJournal, `${path}.data.ledgerJournal`) }
        : {}),
      ...(data.expiry !== undefined ? { expiry: parseExpiry(data.expiry, `${path}.data.expiry`) } : {}),
      ...(data.cancellation !== undefined
        ? { cancellation: parseCancellation(data.cancellation, `${path}.data.cancellation`) }
        : {}),
      ...(data.failure !== undefined ? { failure: parseFailure(data.failure, `${path}.data.failure`) } : {}),
    },
  };
});

export const createPayRunCommandSchema = defineSchema<CreatePayRunCommand>((value, path) => {
  const record = object(value, path, [
    "payRunId",
    "projectId",
    "environment",
    "intent",
    "createdAt",
    "creationIdempotencyKey",
    "requestHash",
    "idempotencyRetentionUntil",
    "idempotencyRecordId",
    "auditEventId",
    "outboxEventId",
    "correlationId",
    "actor",
    "supersedesPayRunId",
  ]);
  const actor = object(record.actor, `${path}.actor`, ["actorId", "actorType"]);
  const supersedesPayRunId = optional(record, "supersedesPayRunId", path, string);
  return {
    payRunId: string(record.payRunId, `${path}.payRunId`),
    projectId: string(record.projectId, `${path}.projectId`),
    environment: enumeration(record.environment, `${path}.environment`, [
      "sandbox",
      "live_guarded",
    ] as const),
    intent: parsePayIntent(record.intent, `${path}.intent`),
    createdAt: timestamp(record.createdAt, `${path}.createdAt`),
    creationIdempotencyKey: string(
      record.creationIdempotencyKey,
      `${path}.creationIdempotencyKey`,
    ),
    requestHash: string(record.requestHash, `${path}.requestHash`),
    idempotencyRetentionUntil: timestamp(
      record.idempotencyRetentionUntil,
      `${path}.idempotencyRetentionUntil`,
    ),
    idempotencyRecordId: string(record.idempotencyRecordId, `${path}.idempotencyRecordId`),
    auditEventId: string(record.auditEventId, `${path}.auditEventId`),
    outboxEventId: string(record.outboxEventId, `${path}.outboxEventId`),
    correlationId: string(record.correlationId, `${path}.correlationId`),
    actor: {
      actorId: string(actor.actorId, `${path}.actor.actorId`),
      actorType: enumeration(actor.actorType, `${path}.actor.actorType`, [
        "agent",
        "user",
        "system",
        "worker",
      ] as const),
    },
    ...(supersedesPayRunId ? { supersedesPayRunId } : {}),
  };
});

export const policyEvaluationInputSchema = defineSchema<PolicyEvaluationRequest>(
  (value, path) => {
    const record = object(value, path, [
      "decisionId",
      "projectId",
      "payRunId",
      "payIntentId",
      "environment",
      "actorScopes",
      "project",
      "agent",
      "merchant",
      "intent",
      "evaluatedBy",
      "policySnapshot",
      "budgetSnapshot",
      "paymentQuote",
      "fundingPreflightQuote",
      "fundingScopeDigest",
      "settlementTarget",
      "rail",
      "evaluatedAt",
      "approval",
      "recheckContext",
    ]);
    const projectId = string(record.projectId, `${path}.projectId`);
    const payRunId = string(record.payRunId, `${path}.payRunId`);
    const payIntentId = string(record.payIntentId, `${path}.payIntentId`);
    const rail = string(record.rail, `${path}.rail`);
    const project = projectSchema.parse(record.project);
    const agent = agentSchema.parse(record.agent);
    const merchant = merchantSchema.parse(record.merchant);
    const intent = parsePayIntent(record.intent, `${path}.intent`);
    const evaluatedBy = parsePolicyEvaluator(
      record.evaluatedBy,
      `${path}.evaluatedBy`,
    );
    const policySnapshot = parsePolicyEvaluationSnapshot(
      record.policySnapshot,
      `${path}.policySnapshot`,
    );
    const budgetSnapshot = parsePolicyBudgetSnapshot(
      record.budgetSnapshot,
      `${path}.budgetSnapshot`,
    );
    const paymentQuote = parsePaymentQuote(
      record.paymentQuote,
      `${path}.paymentQuote`,
    );
    const fundingPreflightQuote = optional(
      record,
      "fundingPreflightQuote",
      path,
      parseFundingPreflightQuote,
    );
    const approval = optional(record, "approval", path, parseApproval);
    const recheckContext = optional(
      record,
      "recheckContext",
      path,
      parseRecheckContext,
    );

    if (
      project.id !== projectId ||
      project.projectId !== projectId ||
      agent.projectId !== projectId ||
      merchant.projectId !== projectId ||
      intent.projectId !== projectId ||
      policySnapshot.projectId !== projectId ||
      paymentQuote.projectId !== projectId ||
      fundingPreflightQuote?.projectId !== undefined &&
        fundingPreflightQuote.projectId !== projectId
    ) {
      throw validationError(
        path,
        "Policy evaluation snapshot must remain inside one Project",
        value,
      );
    }
    if (
      intent.id !== payIntentId ||
      intent.payRunId !== payRunId ||
      intent.agentId !== agent.id ||
      intent.merchant.merchantId !== merchant.id ||
      agent.policyId !== policySnapshot.policyId ||
      paymentQuote.merchantId !== merchant.id ||
      paymentQuote.rail !== rail
    ) {
      throw validationError(
        path,
        "Policy evaluation snapshot identity does not match its PayIntent",
        value,
      );
    }

    return {
      decisionId: string(record.decisionId, `${path}.decisionId`),
      projectId,
      payRunId,
      payIntentId,
      environment: enumeration(record.environment, `${path}.environment`, [
        "sandbox",
        "live_guarded",
      ] as const),
      actorScopes: array(record.actorScopes, `${path}.actorScopes`, string),
      project,
      agent,
      merchant,
      intent,
      evaluatedBy,
      policySnapshot,
      budgetSnapshot,
      paymentQuote,
      ...(fundingPreflightQuote ? { fundingPreflightQuote } : {}),
      fundingScopeDigest: string(
        record.fundingScopeDigest,
        `${path}.fundingScopeDigest`,
      ),
      settlementTarget: parseLogicalTarget(
        record.settlementTarget,
        `${path}.settlementTarget`,
      ),
      rail,
      evaluatedAt: timestamp(record.evaluatedAt, `${path}.evaluatedAt`),
      ...(approval ? { approval } : {}),
      ...(recheckContext ? { recheckContext } : {}),
    };
  },
);
