import { timingSafeEqual } from "node:crypto";

import { canonicalClone, sha256Canonical } from "./canonical-json";
import {
  StoreCorruptionError,
  StoreGenerationOverflowError,
  UnsupportedStoreSchemaVersionError,
} from "./errors";
import {
  appendAuditEvent,
  appendDomainOutboxEvent,
  assertJournalUnique,
  assertUtcIso,
} from "../../domain/invariants";
import {
  approvalSchema,
  auditEventSchema,
  domainOutboxEventSchema,
  fundingPreparationSchema,
  idempotencyRecordSchema,
  ledgerJournalSchema,
  paymentExecutionSchema,
  payRunSchema,
  type RuntimeSchema,
} from "../../domain/schemas";
import type {
  Approval,
  AuditEvent,
  DomainOutboxEvent,
  FundingPreparation,
  IdempotencyRecord,
  InboxEvent,
  LedgerJournal,
  PaymentExecution,
  PayRun,
} from "../../domain/types";

export const LOCAL_JSON_STORE_SCHEMA_VERSION = 1 as const;

const ENVELOPE_KEYS = [
  "schemaVersion",
  "storeGeneration",
  "writtenAt",
  "payload",
  "envelopeChecksum",
] as const;

const PAYLOAD_KEYS = [
  "payRuns",
  "approvals",
  "fundingPreparations",
  "paymentExecutions",
  "ledgerJournals",
  "auditEvents",
  "domainOutboxEvents",
  "idempotencyRecords",
  "inboxEvents",
] as const;

const SHA_256_HEX = /^[0-9a-f]{64}$/;

export interface LocalJsonStorePayload {
  readonly payRuns: readonly PayRun[];
  readonly approvals: readonly Approval[];
  readonly fundingPreparations: readonly FundingPreparation[];
  readonly paymentExecutions: readonly PaymentExecution[];
  readonly ledgerJournals: readonly LedgerJournal[];
  readonly auditEvents: readonly AuditEvent[];
  readonly domainOutboxEvents: readonly DomainOutboxEvent[];
  readonly idempotencyRecords: readonly IdempotencyRecord[];
  readonly inboxEvents: readonly InboxEvent[];
}

export interface LocalJsonStoreEnvelopeContent {
  readonly schemaVersion: typeof LOCAL_JSON_STORE_SCHEMA_VERSION;
  readonly storeGeneration: number;
  readonly writtenAt: string;
  readonly payload: LocalJsonStorePayload;
}

export interface LocalJsonStoreEnvelope extends LocalJsonStoreEnvelopeContent {
  readonly envelopeChecksum: string;
}

function corruption(
  reason: "invalid_envelope" | "runtime_schema_invalid",
  message: string,
  cause?: unknown,
): StoreCorruptionError {
  return new StoreCorruptionError(reason, message, cause === undefined ? undefined : { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  path: string,
  reason: "invalid_envelope" | "runtime_schema_invalid",
): void {
  const actualKeys = Object.keys(value);
  const expected = new Set(expectedKeys);
  const hasExactKeys =
    actualKeys.length === expectedKeys.length && actualKeys.every((key) => expected.has(key));
  if (!hasExactKeys) {
    throw corruption(reason, `${path} must contain exactly: ${expectedKeys.join(", ")}`);
  }
}

function assertValidGeneration(storeGeneration: unknown): asserts storeGeneration is number {
  if (!Number.isSafeInteger(storeGeneration) || (storeGeneration as number) < 0) {
    throw corruption("invalid_envelope", "storeGeneration must be a non-negative safe integer");
  }
}

function assertValidWrittenAt(writtenAt: unknown): asserts writtenAt is string {
  try {
    assertUtcIso(writtenAt, "writtenAt");
  } catch (error) {
    throw corruption("invalid_envelope", "writtenAt must be a canonical UTC ISO-8601 timestamp", error);
  }
}

function parseCollection<T>(
  value: unknown,
  collection: string,
  schema: RuntimeSchema<T>,
): readonly T[] {
  if (!Array.isArray(value)) {
    throw corruption("runtime_schema_invalid", `${collection} must be an array`);
  }
  return value.map((record, index) => {
    try {
      return schema.parse(record);
    } catch (error) {
      throw corruption(
        "runtime_schema_invalid",
        `${collection}[${index}] failed canonical runtime validation`,
        error,
      );
    }
  });
}

function requiredNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw corruption("runtime_schema_invalid", `${path} must be a non-empty string`);
  }
  return value;
}

function requiredPositiveSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw corruption("runtime_schema_invalid", `${path} must be a positive safe integer`);
  }
  return value as number;
}

function parseInboxEvent(value: unknown, index: number): InboxEvent {
  const path = `inboxEvents[${index}]`;
  if (!isRecord(value)) {
    throw corruption("runtime_schema_invalid", `${path} must be an object`);
  }
  const allowedKeys = [
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
  ] as const;
  const actualKeys = Object.keys(value);
  const allowed = new Set<string>(allowedKeys);
  const requiredKeys = allowedKeys.filter((key) => key !== "consumedAt");
  if (
    actualKeys.some((key) => !allowed.has(key)) ||
    requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw corruption("runtime_schema_invalid", `${path} has missing or unexpected fields`);
  }

  const id = requiredNonEmptyString(value.id, `${path}.id`);
  const projectId = requiredNonEmptyString(value.projectId, `${path}.projectId`);
  const version = requiredPositiveSafeInteger(value.version, `${path}.version`);
  const source = requiredNonEmptyString(value.source, `${path}.source`);
  const sourceEventId = requiredNonEmptyString(value.sourceEventId, `${path}.sourceEventId`);
  const payloadDigest = requiredNonEmptyString(value.payloadDigest, `${path}.payloadDigest`);
  if (value.status !== "received" && value.status !== "consumed") {
    throw corruption("runtime_schema_invalid", `${path}.status is invalid`);
  }
  assertInboxTimestamp(value.createdAt, `${path}.createdAt`);
  assertInboxTimestamp(value.updatedAt, `${path}.updatedAt`);
  if (Date.parse(value.updatedAt as string) < Date.parse(value.createdAt as string)) {
    throw corruption("runtime_schema_invalid", `${path}.updatedAt cannot precede createdAt`);
  }
  if (value.consumedAt !== undefined) {
    assertInboxTimestamp(value.consumedAt, `${path}.consumedAt`);
  }
  if (value.status === "received" && value.consumedAt !== undefined) {
    throw corruption("runtime_schema_invalid", `${path}.received event cannot have consumedAt`);
  }
  if (value.status === "consumed" && value.consumedAt === undefined) {
    throw corruption("runtime_schema_invalid", `${path}.consumed event requires consumedAt`);
  }

  return {
    id,
    projectId,
    version,
    source,
    sourceEventId,
    status: value.status,
    payloadDigest,
    ...(value.consumedAt === undefined ? {} : { consumedAt: value.consumedAt as string }),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function assertInboxTimestamp(value: unknown, path: string): asserts value is string {
  try {
    assertUtcIso(value, path);
  } catch (error) {
    throw corruption("runtime_schema_invalid", `${path} must be a canonical UTC timestamp`, error);
  }
}

function assertUnique(
  collection: string,
  records: readonly unknown[],
  keyOf: (record: never) => string,
): void {
  const seen = new Set<string>();
  for (const record of records) {
    const key = keyOf(record as never);
    if (seen.has(key)) {
      throw corruption("runtime_schema_invalid", `${collection} contains duplicate identity`);
    }
    seen.add(key);
  }
}

function validateCollectionIndexes(payload: LocalJsonStorePayload): void {
  const byId = (record: { projectId: string; id: string }) => `${record.projectId}\u0000${record.id}`;
  for (const [collection, records] of [
    ["payRuns", payload.payRuns],
    ["approvals", payload.approvals],
    ["fundingPreparations", payload.fundingPreparations],
    ["paymentExecutions", payload.paymentExecutions],
    ["ledgerJournals", payload.ledgerJournals],
    ["auditEvents", payload.auditEvents],
    ["domainOutboxEvents", payload.domainOutboxEvents],
    ["idempotencyRecords", payload.idempotencyRecords],
    ["inboxEvents", payload.inboxEvents],
  ] as const) {
    assertUnique(collection, records, byId as (record: never) => string);
  }

  assertUnique(
    "auditEvents aggregate sequence",
    payload.auditEvents,
    (record: AuditEvent) =>
      `${record.projectId}\u0000${record.aggregateType}\u0000${record.aggregateId}\u0000${record.sequence}`,
  );
  assertUnique(
    "domainOutboxEvents aggregate sequence",
    payload.domainOutboxEvents,
    (record: DomainOutboxEvent) =>
      `${record.projectId}\u0000${record.aggregateType}\u0000${record.aggregateId}\u0000${record.sequence}`,
  );
  assertUnique(
    "idempotencyRecords command key",
    payload.idempotencyRecords,
    (record: IdempotencyRecord) => `${record.projectId}\u0000${record.commandType}\u0000${record.key}`,
  );
  assertUnique(
    "inboxEvents source identity",
    payload.inboxEvents,
    (record: InboxEvent) => `${record.projectId}\u0000${record.source}\u0000${record.sourceEventId}`,
  );

  for (const event of payload.auditEvents) {
    if (event.payRunId !== event.aggregateId) {
      throw corruption("runtime_schema_invalid", "AuditEvent payRunId must equal aggregateId");
    }
  }

  try {
    const auditLineages = new Map<string, readonly AuditEvent[]>();
    for (const event of payload.auditEvents) {
      const key = `${event.projectId}\u0000${event.aggregateType}\u0000${event.aggregateId}`;
      const lineage = auditLineages.get(key) ?? [];
      auditLineages.set(key, appendAuditEvent(lineage, event));
    }

    const outboxLineages = new Map<string, readonly DomainOutboxEvent[]>();
    for (const event of payload.domainOutboxEvents) {
      const key = `${event.projectId}\u0000${event.aggregateType}\u0000${event.aggregateId}`;
      const lineage = outboxLineages.get(key) ?? [];
      outboxLineages.set(key, appendDomainOutboxEvent(lineage, event));
    }

    const journals: LedgerJournal[] = [];
    for (const journal of payload.ledgerJournals) {
      assertJournalUnique(journals, journal);
      journals.push(journal);
    }
  } catch (error) {
    throw corruption(
      "runtime_schema_invalid",
      "payload violates append-only lineage or evidence index invariants",
      error,
    );
  }
}

export function validateStorePayload(value: unknown): LocalJsonStorePayload {
  if (!isRecord(value)) {
    throw corruption("runtime_schema_invalid", "payload must be an object");
  }
  assertExactKeys(value, PAYLOAD_KEYS, "payload", "runtime_schema_invalid");

  const payload: LocalJsonStorePayload = {
    payRuns: parseCollection(value.payRuns, "payRuns", payRunSchema),
    approvals: parseCollection(value.approvals, "approvals", approvalSchema),
    fundingPreparations: parseCollection(
      value.fundingPreparations,
      "fundingPreparations",
      fundingPreparationSchema,
    ),
    paymentExecutions: parseCollection(
      value.paymentExecutions,
      "paymentExecutions",
      paymentExecutionSchema,
    ),
    ledgerJournals: parseCollection(value.ledgerJournals, "ledgerJournals", ledgerJournalSchema),
    auditEvents: parseCollection(value.auditEvents, "auditEvents", auditEventSchema),
    domainOutboxEvents: parseCollection(
      value.domainOutboxEvents,
      "domainOutboxEvents",
      domainOutboxEventSchema,
    ),
    idempotencyRecords: parseCollection(
      value.idempotencyRecords,
      "idempotencyRecords",
      idempotencyRecordSchema,
    ),
    inboxEvents: Array.isArray(value.inboxEvents)
      ? value.inboxEvents.map(parseInboxEvent)
      : (() => {
          throw corruption("runtime_schema_invalid", "inboxEvents must be an array");
        })(),
  };
  validateCollectionIndexes(payload);
  return canonicalClone(payload);
}

export function createStoreEnvelope(
  payload: LocalJsonStorePayload,
  storeGeneration: number,
  writtenAt: string,
): LocalJsonStoreEnvelope {
  assertValidGeneration(storeGeneration);
  assertValidWrittenAt(writtenAt);
  const content: LocalJsonStoreEnvelopeContent = {
    schemaVersion: LOCAL_JSON_STORE_SCHEMA_VERSION,
    storeGeneration,
    writtenAt,
    payload: validateStorePayload(payload),
  };
  return canonicalClone({ ...content, envelopeChecksum: sha256Canonical(content) });
}

export function buildEmptyStoreEnvelope(writtenAt: string): LocalJsonStoreEnvelope {
  return createStoreEnvelope(
    {
      payRuns: [],
      approvals: [],
      fundingPreparations: [],
      paymentExecutions: [],
      ledgerJournals: [],
      auditEvents: [],
      domainOutboxEvents: [],
      idempotencyRecords: [],
      inboxEvents: [],
    },
    0,
    writtenAt,
  );
}

function checksumsEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(actual, "hex");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function parseStoreEnvelope(text: string): LocalJsonStoreEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new StoreCorruptionError("malformed_json", "Local JSON store contains malformed JSON", {
      cause: error,
    });
  }

  if (!isRecord(parsed)) {
    throw corruption("invalid_envelope", "Local JSON store envelope must be an object");
  }
  assertExactKeys(parsed, ENVELOPE_KEYS, "envelope", "invalid_envelope");
  if (typeof parsed.schemaVersion !== "number") {
    throw corruption("invalid_envelope", "schemaVersion must be a number");
  }
  if (parsed.schemaVersion !== LOCAL_JSON_STORE_SCHEMA_VERSION) {
    throw new UnsupportedStoreSchemaVersionError(parsed.schemaVersion);
  }
  assertValidGeneration(parsed.storeGeneration);
  assertValidWrittenAt(parsed.writtenAt);
  if (typeof parsed.envelopeChecksum !== "string" || !SHA_256_HEX.test(parsed.envelopeChecksum)) {
    throw corruption("invalid_envelope", "envelopeChecksum must be lowercase SHA-256 hexadecimal");
  }

  const content = {
    schemaVersion: LOCAL_JSON_STORE_SCHEMA_VERSION,
    storeGeneration: parsed.storeGeneration,
    writtenAt: parsed.writtenAt,
    payload: parsed.payload,
  };
  let expectedChecksum: string;
  try {
    expectedChecksum = sha256Canonical(content);
  } catch (error) {
    throw corruption("invalid_envelope", "Envelope content is not canonical JSON", error);
  }
  if (!checksumsEqual(expectedChecksum, parsed.envelopeChecksum)) {
    throw new StoreCorruptionError("checksum_mismatch", "Local JSON store checksum does not match");
  }

  return canonicalClone({
    ...content,
    payload: validateStorePayload(parsed.payload),
    envelopeChecksum: parsed.envelopeChecksum,
  });
}

export function nextStoreGeneration(current: number): number {
  assertValidGeneration(current);
  if (current === Number.MAX_SAFE_INTEGER) {
    throw new StoreGenerationOverflowError(current);
  }
  return current + 1;
}
