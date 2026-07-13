import { sha256Canonical } from "@/features/payrun/adapters/storage/canonical-json";
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
} from "@/features/payrun/domain/types";
import {
  buildApproval,
  buildAuditEvent,
  buildFundingPreparation,
  buildIdempotencyRecord,
  buildLedgerJournal,
  buildOutboxEvent,
  buildPaymentExecution,
  buildPayRunAt,
  PROJECT_ID,
} from "@/test/payrun/domain/fixtures";

export const STORE_WRITTEN_AT = "2026-07-13T08:00:00.000Z";

export interface StorePayloadFixture {
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

export function buildEmptyStorePayloadFixture(): StorePayloadFixture {
  return {
    payRuns: [],
    approvals: [],
    fundingPreparations: [],
    paymentExecutions: [],
    ledgerJournals: [],
    auditEvents: [],
    domainOutboxEvents: [],
    idempotencyRecords: [],
    inboxEvents: [],
  };
}

export function buildInboxEventFixture(overrides: Partial<InboxEvent> = {}): InboxEvent {
  return {
    id: "inbox_001",
    projectId: PROJECT_ID,
    version: 1,
    source: "sandbox_webhook",
    sourceEventId: "source_event_001",
    status: "received",
    payloadDigest: "sha256:inbox:001",
    createdAt: STORE_WRITTEN_AT,
    updatedAt: STORE_WRITTEN_AT,
    ...overrides,
  };
}

export function buildPopulatedStorePayloadFixture(): StorePayloadFixture {
  const payRun = {
    ...buildPayRunAt("intent_recorded"),
    version: 8,
    lastAuditSequence: 8,
    lastOutboxSequence: 8,
  };

  return {
    payRuns: [payRun],
    approvals: [buildApproval()],
    fundingPreparations: [buildFundingPreparation()],
    paymentExecutions: [buildPaymentExecution()],
    ledgerJournals: [buildLedgerJournal()],
    auditEvents: [
      buildAuditEvent({
        id: "audit_001",
        sequence: 1,
        beforeVersion: 0,
        afterVersion: 1,
      }),
    ],
    domainOutboxEvents: [
      buildOutboxEvent({
        id: "outbox_001",
        sequence: 1,
        aggregateVersion: 1,
        eventType: "payrun.created",
        payload: { payRunId: payRun.id, afterVersion: 1 },
      }),
    ],
    idempotencyRecords: [buildIdempotencyRecord()],
    inboxEvents: [buildInboxEventFixture()],
  };
}

export function buildStoreEnvelopeFixture(
  payload: StorePayloadFixture = buildEmptyStorePayloadFixture(),
  storeGeneration = 0,
  writtenAt = STORE_WRITTEN_AT,
) {
  const content = {
    schemaVersion: 1,
    storeGeneration,
    writtenAt,
    payload,
  };

  return {
    ...content,
    envelopeChecksum: sha256Canonical(content),
  };
}

export function stringifyStoreEnvelopeFixture(value: unknown): string {
  return JSON.stringify(value);
}
