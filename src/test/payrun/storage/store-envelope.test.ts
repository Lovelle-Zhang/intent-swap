import { describe, expect, it } from "vitest";

import { sha256Canonical } from "@/features/payrun/adapters/storage/canonical-json";
import {
  buildEmptyStoreEnvelope,
  createStoreEnvelope,
  LOCAL_JSON_STORE_SCHEMA_VERSION,
  nextStoreGeneration,
  parseStoreEnvelope,
} from "@/features/payrun/adapters/storage/store-envelope";
import {
  StoreCorruptionError,
  StoreGenerationOverflowError,
  UnsupportedStoreSchemaVersionError,
} from "@/features/payrun/adapters/storage/errors";
import {
  buildEmptyStorePayloadFixture,
  buildPopulatedStorePayloadFixture,
  buildStoreEnvelopeFixture,
  STORE_WRITTEN_AT,
  stringifyStoreEnvelopeFixture,
} from "@/test/payrun/storage/fixtures";
import {
  buildAuditEvent,
  buildLedgerJournal,
  buildOutboxEvent,
} from "@/test/payrun/domain/fixtures";

function withValidChecksum(value: Record<string, unknown>): Record<string, unknown> {
  const { envelopeChecksum: _checksum, ...content } = value;
  return { ...content, envelopeChecksum: sha256Canonical(content) };
}

describe("local JSON store envelope", () => {
  it("builds the exact empty schema-v2 generation-0 envelope", () => {
    const envelope = buildEmptyStoreEnvelope(STORE_WRITTEN_AT);
    const content = {
      schemaVersion: LOCAL_JSON_STORE_SCHEMA_VERSION,
      storeGeneration: 0,
      writtenAt: STORE_WRITTEN_AT,
      payload: buildEmptyStorePayloadFixture(),
    };

    expect(envelope).toEqual({
      ...content,
      envelopeChecksum: sha256Canonical(content),
    });
  });

  it("checksums schema, generation, writtenAt, and the complete payload", () => {
    const payload = buildPopulatedStorePayloadFixture();
    const envelope = createStoreEnvelope(payload, 4, STORE_WRITTEN_AT);
    const { envelopeChecksum, ...content } = envelope;

    expect(envelopeChecksum).toBe(sha256Canonical(content));
    expect(envelopeChecksum).not.toBe(
      sha256Canonical({ ...content, storeGeneration: 5 }),
    );
    expect(envelopeChecksum).not.toBe(
      sha256Canonical({ ...content, writtenAt: "2026-07-13T08:00:01.000Z" }),
    );
    expect(envelopeChecksum).not.toBe(
      sha256Canonical({ ...content, payload: buildEmptyStorePayloadFixture() }),
    );
  });

  it("parses and validates all payload collections", () => {
    const envelope = buildStoreEnvelopeFixture(buildPopulatedStorePayloadFixture(), 6);

    expect(parseStoreEnvelope(stringifyStoreEnvelopeFixture(envelope))).toEqual(envelope);
  });

  it("fails explicitly for malformed JSON", () => {
    expect(() => parseStoreEnvelope('{"schemaVersion":1')).toThrowError(
      expect.objectContaining({ code: "store_corrupt", reason: "malformed_json" }),
    );
  });

  it("rejects unsupported schema versions before checksum validation", () => {
    const envelope = { ...buildStoreEnvelopeFixture(), schemaVersion: 3 };

    expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
      expect.objectContaining({ code: "unsupported_store_schema_version", schemaVersion: 3 }),
    );
    expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
      UnsupportedStoreSchemaVersionError,
    );
  });

  it.each([
    ["an unexpected envelope key", { unexpected: true }],
    ["a missing envelope key", null],
    ["an invalid checksum shape", "not-a-sha256"],
  ])("rejects %s", (_name, variation) => {
    const envelope = buildStoreEnvelopeFixture() as Record<string, unknown>;
    if (variation === null) {
      delete envelope.writtenAt;
    } else if (typeof variation === "string") {
      envelope.envelopeChecksum = variation;
    } else {
      Object.assign(envelope, variation);
    }

    expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
      expect.objectContaining({ code: "store_corrupt", reason: "invalid_envelope" }),
    );
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe store generation %s",
    (storeGeneration) => {
      const envelope = withValidChecksum({
        ...buildStoreEnvelopeFixture(),
        storeGeneration,
      });

      expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
        expect.objectContaining({ code: "store_corrupt", reason: "invalid_envelope" }),
      );
    },
  );

  it.each([
    "2026-07-13T08:00:00+00:00",
    "2026-07-13 08:00:00Z",
    "2026-02-30T08:00:00.000Z",
  ])("rejects non-canonical writtenAt %s", (writtenAt) => {
    const envelope = withValidChecksum({ ...buildStoreEnvelopeFixture(), writtenAt });

    expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
      expect.objectContaining({ code: "store_corrupt", reason: "invalid_envelope" }),
    );
  });

  it("rejects checksum mismatch without parsing the payload as domain state", () => {
    const envelope = buildStoreEnvelopeFixture();
    const tampered = {
      ...envelope,
      payload: { ...envelope.payload, payRuns: [{ status: "not-a-real-status" }] },
    };

    expect(() => parseStoreEnvelope(JSON.stringify(tampered))).toThrowError(
      expect.objectContaining({ code: "store_corrupt", reason: "checksum_mismatch" }),
    );
  });

  it.each([
    ["payRuns", (record: Record<string, unknown>) => ({ ...record, status: "invalid" })],
    ["approvals", (record: Record<string, unknown>) => ({ ...record, status: "invalid" })],
    [
      "fundingPreparations",
      (record: Record<string, unknown>) => ({ ...record, status: "invalid" }),
    ],
    [
      "paymentExecutions",
      (record: Record<string, unknown>) => ({ ...record, status: "invalid" }),
    ],
    [
      "ledgerJournals",
      (record: Record<string, unknown>) => ({ ...record, externalReference: "" }),
    ],
    ["auditEvents", (record: Record<string, unknown>) => ({ ...record, sequence: 0 })],
    [
      "domainOutboxEvents",
      (record: Record<string, unknown>) => ({ ...record, schemaVersion: 0 }),
    ],
    [
      "idempotencyRecords",
      (record: Record<string, unknown>) => ({ ...record, state: "invalid" }),
    ],
    ["inboxEvents", (record: Record<string, unknown>) => ({ ...record, unexpected: true })],
  ] as const)("rejects invalid canonical records in %s", (collection, mutate) => {
    const payload = buildPopulatedStorePayloadFixture();
    const original = payload[collection][0] as unknown as Record<string, unknown>;
    const invalidPayload = { ...payload, [collection]: [mutate(original)] };
    const envelope = buildStoreEnvelopeFixture(invalidPayload);

    expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
      expect.objectContaining({ code: "store_corrupt", reason: "runtime_schema_invalid" }),
    );
  });

  it("rejects an invalid payload shape and unexpected collection keys", () => {
    for (const payload of [
      { ...buildEmptyStorePayloadFixture(), payRuns: {} },
      { ...buildEmptyStorePayloadFixture(), unexpected: [] },
    ]) {
      const envelope = buildStoreEnvelopeFixture(
        payload as ReturnType<typeof buildEmptyStorePayloadFixture>,
      );
      expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
        expect.objectContaining({ code: "store_corrupt", reason: "runtime_schema_invalid" }),
      );
    }
  });

  it("rejects duplicate project-scoped record identities", () => {
    const payload = buildPopulatedStorePayloadFixture();
    const envelope = buildStoreEnvelopeFixture({
      ...payload,
      payRuns: [payload.payRuns[0], payload.payRuns[0]],
    });

    expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
      expect.objectContaining({ code: "store_corrupt", reason: "runtime_schema_invalid" }),
    );
  });

  it("rejects duplicate Audit and Outbox aggregate sequences", () => {
    const payload = buildPopulatedStorePayloadFixture();
    for (const mutatedPayload of [
      { ...payload, auditEvents: [payload.auditEvents[0], { ...payload.auditEvents[0], id: "audit_009" }] },
      {
        ...payload,
        domainOutboxEvents: [
          payload.domainOutboxEvents[0],
          { ...payload.domainOutboxEvents[0], id: "outbox_009" },
        ],
      },
    ]) {
      const envelope = buildStoreEnvelopeFixture(mutatedPayload);
      expect(() => parseStoreEnvelope(JSON.stringify(envelope))).toThrowError(
        expect.objectContaining({ code: "store_corrupt", reason: "runtime_schema_invalid" }),
      );
    }
  });

  it("rejects checksummed but discontinuous Audit and Outbox histories", () => {
    const firstAudit = buildAuditEvent({ sequence: 1, beforeVersion: 0, afterVersion: 1 });
    const firstOutbox = buildOutboxEvent({
      sequence: 1,
      aggregateVersion: 1,
      eventType: "payrun.created",
      payload: { payRunId: firstAudit.aggregateId, afterVersion: 1 },
    });
    const invalidPayloads = [
      {
        ...buildEmptyStorePayloadFixture(),
        auditEvents: [
          firstAudit,
          { ...firstAudit, id: "audit_002", sequence: 2, beforeVersion: 0, afterVersion: 1 },
        ],
      },
      {
        ...buildEmptyStorePayloadFixture(),
        domainOutboxEvents: [
          firstOutbox,
          {
            ...firstOutbox,
            id: "outbox_002",
            sequence: 2,
            aggregateVersion: 2,
            payload: { payRunId: firstOutbox.aggregateId, afterVersion: 1 },
          },
        ],
      },
    ];

    for (const payload of invalidPayloads) {
      expect(() => parseStoreEnvelope(JSON.stringify(buildStoreEnvelopeFixture(payload)))).toThrowError(
        expect.objectContaining({ code: "store_corrupt", reason: "runtime_schema_invalid" }),
      );
    }
  });

  it("rejects checksummed Ledger journals with conflicting project-scoped evidence indexes", () => {
    const first = buildLedgerJournal();
    const duplicateBase = {
      ...first,
      id: "ledger_002",
      entries: first.entries.map((entry) => ({ ...entry, journalId: "ledger_002" })),
    };
    const conflicts = [
      { ...duplicateBase, externalReference: "external_other" },
      { ...duplicateBase, executionProofId: "proof_other" },
    ];

    for (const conflict of conflicts) {
      const payload = {
        ...buildEmptyStorePayloadFixture(),
        ledgerJournals: [first, conflict],
      };
      expect(() => parseStoreEnvelope(JSON.stringify(buildStoreEnvelopeFixture(payload)))).toThrowError(
        expect.objectContaining({ code: "store_corrupt", reason: "runtime_schema_invalid" }),
      );
    }
  });

  it("increments generation once and rejects overflow", () => {
    expect(nextStoreGeneration(0)).toBe(1);
    expect(nextStoreGeneration(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => nextStoreGeneration(Number.MAX_SAFE_INTEGER)).toThrowError(
      StoreGenerationOverflowError,
    );
  });

  it("uses explicit storage errors", () => {
    expect(() => parseStoreEnvelope("null")).toThrowError(StoreCorruptionError);
  });
});
