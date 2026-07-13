import { describe, expect, it } from "vitest";

import {
  appendAuditEvent,
  appendDomainOutboxEvent,
  assertEvidenceCompatible,
  assertIntentCurrent,
  assertJournalUnique,
  assertLedgerBalanced,
  assertPayRunInvariants,
  assertSameProject,
  resolveIdempotency,
} from "@/features/payrun/domain/invariants";
import {
  AuditAppendError,
  EvidenceEnvironmentError,
  IdempotencyConflictError,
  InvariantViolationError,
  IntentExpiredError,
  ProjectScopeError,
} from "@/features/payrun/domain/errors";
import type { EvidenceReference, PayRun } from "@/features/payrun/domain/types";
import {
  EXPIRES_AT,
  OTHER_PROJECT_ID,
  PAY_RUN_ID,
  PROJECT_ID,
  buildAuditEvent,
  buildFundingPreparation,
  buildIdempotencyRecord,
  buildIntent,
  buildLedgerJournal,
  buildOutboxEvent,
  buildPayRunAt,
  buildPaymentExecution,
  buildPolicyDecision,
  sandboxEvidence,
} from "./fixtures";

describe("PayRun domain invariants", () => {
  it("rejects cross-project artifacts", () => {
    expect(() =>
      assertSameProject(PROJECT_ID, {
        projectId: OTHER_PROJECT_ID,
      }),
    ).toThrowError(ProjectScopeError);
  });

  it.each(["pending_review", "blocked"] as const)(
    "%s cannot contain downstream funding, payment, proof, or ledger artifacts",
    (status) => {
      const invalid = {
        ...buildPayRunAt(status),
        fundingPreparation: buildFundingPreparation("not_required"),
      } as PayRun;

      expect(() => assertPayRunInvariants(invalid)).toThrowError(InvariantViolationError);
    },
  );

  it("rejects Payment without an accepted Funding result", () => {
    const invalid = {
      ...buildPayRunAt("payment_executing"),
      fundingPreparation: buildFundingPreparation("planned"),
    } as PayRun;

    expect(() => assertPayRunInvariants(invalid)).toThrowError(InvariantViolationError);
  });

  it.each([
    "policyDecisions",
    "fundingPreparation",
    "paymentExecution",
    "executionProof",
    "ledgerJournal",
  ] as const)("completed requires %s evidence", (field) => {
    const valid = buildPayRunAt("completed");
    const invalid = {
      ...valid,
      [field]: field === "policyDecisions" ? [] : undefined,
    } as unknown as PayRun;

    expect(() => assertPayRunInvariants(invalid)).toThrowError(InvariantViolationError);
  });

  it("completed requires prior audit and outbox evidence", () => {
    expect(() =>
      assertPayRunInvariants({
        ...buildPayRunAt("completed"),
        lastAuditSequence: 0,
      }),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      assertPayRunInvariants({
        ...buildPayRunAt("completed"),
        lastOutboxSequence: 0,
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("accepts a balanced integer-atomic Ledger journal", () => {
    expect(() => assertLedgerBalanced(buildLedgerJournal())).not.toThrow();
  });

  it.each([
    {
      name: "unbalanced totals",
      journal: buildLedgerJournal({
        entries: [
          ...buildLedgerJournal().entries.slice(0, 1),
          {
            ...buildLedgerJournal().entries[1],
            creditAtomic: "419999",
          },
        ],
      }),
    },
    {
      name: "both debit and credit populated",
      journal: buildLedgerJournal({
        entries: [
          {
            ...buildLedgerJournal().entries[0],
            creditAtomic: "1",
          },
          buildLedgerJournal().entries[1],
        ],
      }),
    },
    {
      name: "negative amount",
      journal: buildLedgerJournal({
        entries: [
          {
            ...buildLedgerJournal().entries[0],
            debitAtomic: "-1",
          },
          buildLedgerJournal().entries[1],
        ],
      }),
    },
  ])("rejects $name", ({ journal }) => {
    expect(() => assertLedgerBalanced(journal)).toThrowError(InvariantViolationError);
  });

  it("prevents the same proof or external reference from posting twice", () => {
    const committed = buildLedgerJournal();
    const duplicateProof = buildLedgerJournal({ id: "ledger_journal_002" });
    expect(() => assertJournalUnique([committed], duplicateProof)).toThrowError(
      InvariantViolationError,
    );

    const duplicateExternal = buildLedgerJournal({
      id: "ledger_journal_003",
      executionProofId: "proof_other",
    });
    expect(() => assertJournalUnique([committed], duplicateExternal)).toThrowError(
      InvariantViolationError,
    );
  });

  it("appends AuditEvent without mutating prior history and enforces sequence", () => {
    const first = buildAuditEvent({
      id: "audit_001",
      sequence: 1,
      beforeVersion: 0,
      afterVersion: 1,
    });
    const original = Object.freeze([first] as const);
    const second = buildAuditEvent({
      id: "audit_002",
      sequence: 2,
      beforeVersion: 1,
      afterVersion: 2,
    });

    const appended = appendAuditEvent(original, second);
    expect(original).toHaveLength(1);
    expect(appended).toEqual([first, second]);
    expect(Object.isFrozen(appended)).toBe(true);
    expect(() => appendAuditEvent(appended, second)).toThrowError(AuditAppendError);
  });

  it("appends immutable Domain Outbox events monotonically", () => {
    const first = buildOutboxEvent({ id: "outbox_001", sequence: 1, aggregateVersion: 1 });
    const second = buildOutboxEvent({ id: "outbox_002", sequence: 2, aggregateVersion: 2 });
    const appended = appendDomainOutboxEvent([first], second);

    expect(appended).toEqual([first, second]);
    expect(Object.isFrozen(appended)).toBe(true);
    expect(() => appendDomainOutboxEvent(appended, second)).toThrowError(AuditAppendError);
  });

  it("reuses the same idempotency scope and hash but rejects hash drift", () => {
    const existing = buildIdempotencyRecord();
    const replay = resolveIdempotency(existing, {
      projectId: existing.projectId,
      commandType: existing.commandType,
      key: existing.key,
      requestHash: existing.requestHash,
      commandAt: "2026-07-12T00:02:00.000Z",
    });
    expect(replay).toEqual({ kind: "replay", record: existing });

    expect(() =>
      resolveIdempotency(existing, {
        projectId: existing.projectId,
        commandType: existing.commandType,
        key: existing.key,
        requestHash: "sha256:different-request",
        commandAt: "2026-07-12T00:02:00.000Z",
      }),
    ).toThrowError(IdempotencyConflictError);
  });

  it("does not reveal or reuse an idempotency record across Projects", () => {
    const existing = buildIdempotencyRecord();
    expect(() =>
      resolveIdempotency(existing, {
        projectId: OTHER_PROJECT_ID,
        commandType: existing.commandType,
        key: existing.key,
        requestHash: existing.requestHash,
        commandAt: "2026-07-12T00:02:00.000Z",
      }),
    ).toThrowError(ProjectScopeError);
  });

  it("keeps Sandbox and live evidence namespaces separate", () => {
    const liveEvidence: EvidenceReference = {
      environment: "live_guarded",
      kind: "guarded_payment_evidence",
      provider: "future_guarded_provider",
      reference: "provider:payment:001",
      observedStatus: "verified",
      checksum: "sha256:live:001",
      capturedAt: "2026-07-12T00:00:00.000Z",
      verificationMethod: "provider_signature",
      synthetic: false,
      transactionHash: "0xabc",
    };

    expect(() => assertEvidenceCompatible("sandbox", liveEvidence)).toThrowError(
      EvidenceEnvironmentError,
    );
    expect(() =>
      assertEvidenceCompatible("live_guarded", sandboxEvidence("sandbox_payment_evidence")),
    ).toThrowError(EvidenceEnvironmentError);
  });

  it("rejects an idempotency record whose retention ended by command time", () => {
    const existing = buildIdempotencyRecord({
      retentionUntil: "2026-07-12T00:02:00.000Z",
    });
    expect(() =>
      resolveIdempotency(existing, {
        projectId: existing.projectId,
        commandType: existing.commandType,
        key: existing.key,
        requestHash: existing.requestHash,
        commandAt: "2026-07-12T00:02:00.000Z",
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("fails closed when an intent is expired", () => {
    expect(() => assertIntentCurrent(buildIntent(), EXPIRES_AT)).toThrowError(IntentExpiredError);
  });

  it("requires PayRun and artifact IDs to share lineage", () => {
    const invalid = {
      ...buildPayRunAt("completed"),
      ledgerJournal: buildLedgerJournal({ payRunId: "payrun_other" }),
    } as PayRun;
    expect(() => assertPayRunInvariants(invalid)).toThrowError(InvariantViolationError);
    expect(invalid.id).toBe(PAY_RUN_ID);
  });

  it("binds Funding to the immutable intent, current allowed decision, amount, and target", () => {
    const base = buildPayRunAt("funding_prepared");
    const mutations = [
      buildFundingPreparation("not_required", { intentDigest: "sha256:changed" }),
      buildFundingPreparation("not_required", { policyDecisionId: "decision_other" }),
      buildFundingPreparation("not_required", { requestedAmount: { ...base.intent.quotedAmount, amountAtomic: "1" } }),
    ];
    for (const fundingPreparation of mutations) {
      expect(() => assertPayRunInvariants({ ...base, fundingPreparation })).toThrowError(
        InvariantViolationError,
      );
    }
  });

  it("requires append-only FundingAttempt identity and domain-specific evidence", () => {
    const base = buildPayRunAt("funding_prepared");
    const valid = buildFundingPreparation("not_required");
    const attempt = valid.attempts?.[0];
    expect(attempt).toBeDefined();
    expect(() =>
      assertPayRunInvariants({
        ...base,
        fundingPreparation: {
          ...valid,
          attempts: [{ ...attempt!, planDigest: "sha256:other-plan" }],
        },
      }),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      assertPayRunInvariants({
        ...base,
        fundingPreparation: {
          ...valid,
          evidence: sandboxEvidence("sandbox_payment_evidence"),
        },
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("binds PaymentInstruction and append-only ExecutionAttempt to one logical payment", () => {
    const base = buildPayRunAt("payment_succeeded");
    expect(() =>
      assertPayRunInvariants({
        ...base,
        paymentExecution: buildPaymentExecution("succeeded", {
          instruction: {
            ...buildPaymentExecution("succeeded").instruction,
            merchantId: "merchant_other",
          },
        }),
      }),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      assertPayRunInvariants({
        ...base,
        paymentExecution: buildPaymentExecution("succeeded", {
          instruction: {
            ...buildPaymentExecution("succeeded").instruction,
            fundingPreparationId: "funding_other",
          } as ReturnType<typeof buildPaymentExecution>["instruction"],
        }),
      }),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      assertPayRunInvariants({
        ...base,
        paymentExecution: buildPaymentExecution("succeeded", { attempts: [] }),
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("keeps Payment, ExecutionProof, no-transfer, expiry, and release evidence isolated", () => {
    const succeeded = buildPayRunAt("payment_succeeded");
    expect(() =>
      assertPayRunInvariants({
        ...succeeded,
        paymentExecution: buildPaymentExecution("succeeded", {
          evidence: sandboxEvidence("sandbox_funding_evidence"),
        }),
      }),
    ).toThrowError(InvariantViolationError);

    const completed = buildPayRunAt("completed");
    expect(() =>
      assertPayRunInvariants({
        ...completed,
        executionProof: {
          ...completed.executionProof!,
          evidence: sandboxEvidence("sandbox_payment_evidence"),
        },
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("binds completed Ledger evidence to the exact payment value and proof", () => {
    const base = buildPayRunAt("completed");
    expect(() =>
      assertPayRunInvariants({
        ...base,
        ledgerJournal: buildLedgerJournal({ externalReference: "sandbox:payment:other" }),
      }),
    ).toThrowError(InvariantViolationError);
    expect(() =>
      assertPayRunInvariants({
        ...base,
        ledgerJournal: buildLedgerJournal({
          entries: buildLedgerJournal().entries.map((entry) => ({
            ...entry,
            debitAtomic: entry.debitAtomic === "420000" ? "1" : "0",
            creditAtomic: entry.creditAtomic === "420000" ? "1" : "0",
          })),
        }),
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("validates PolicyDecision consistency and Approval binding before Funding", () => {
    const allowed = buildPayRunAt("policy_allowed");
    expect(() =>
      assertPayRunInvariants({
        ...allowed,
        policyDecisions: [buildPolicyDecision("allowed", { outcome: "blocked" })],
      }),
    ).toThrowError(InvariantViolationError);

    const review = buildPayRunAt("pending_review");
    expect(() =>
      assertPayRunInvariants({
        ...review,
        approval: {
          ...review.approval!,
          request: { ...review.approval!.request, merchantId: "merchant_other" },
        },
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("retains historical approved evidence when an Approval-aware recheck hard-blocks", () => {
    const approved = buildPayRunAt("approved");
    expect(() =>
      assertPayRunInvariants({
        ...approved,
        status: "blocked",
        policyDecisions: [
          ...approved.policyDecisions,
          buildPolicyDecision("blocked"),
        ],
      }),
    ).not.toThrow();
  });

  it("requires Approval covered reasons to exactly match the reviewed decision", () => {
    const review = buildPayRunAt("pending_review");
    expect(() =>
      assertPayRunInvariants({
        ...review,
        approval: {
          ...review.approval!,
          request: {
            ...review.approval!.request,
            coveredReasonCodes: ["approval.threshold_reached", "merchant.new_requires_review"],
          },
        },
      }),
    ).toThrowError(InvariantViolationError);
  });

  it("does not freeze or mutate caller-owned Audit and Outbox inputs", () => {
    const firstAudit = buildAuditEvent({ sequence: 1, beforeVersion: 0, afterVersion: 1 });
    const secondAudit = buildAuditEvent({ id: "audit_002", sequence: 2, beforeVersion: 1, afterVersion: 2 });
    appendAuditEvent([firstAudit], secondAudit);
    expect(Object.isFrozen(firstAudit)).toBe(false);
    expect(Object.isFrozen(secondAudit)).toBe(false);

    const firstOutbox = buildOutboxEvent({ id: "outbox_001", sequence: 1, aggregateVersion: 1 });
    const secondOutbox = buildOutboxEvent({ id: "outbox_002", sequence: 2, aggregateVersion: 2 });
    appendDomainOutboxEvent([firstOutbox], secondOutbox);
    expect(Object.isFrozen(firstOutbox)).toBe(false);
    expect(Object.isFrozen(secondOutbox)).toBe(false);
  });

  it("rejects duplicate event IDs and Outbox payload lineage drift", () => {
    const firstAudit = buildAuditEvent({ id: "event_same", sequence: 1, beforeVersion: 0, afterVersion: 1 });
    expect(() =>
      appendAuditEvent([firstAudit], buildAuditEvent({ id: "event_same", sequence: 2, beforeVersion: 1, afterVersion: 2 })),
    ).toThrowError(AuditAppendError);

    const first = buildOutboxEvent({ id: "outbox_001", sequence: 1, aggregateVersion: 1 });
    expect(() =>
      appendDomainOutboxEvent(
        [first],
        buildOutboxEvent({
          id: "outbox_002",
          sequence: 2,
          aggregateVersion: 2,
          payload: { payRunId: "payrun_other", afterVersion: 2 },
        }),
      ),
    ).toThrowError(AuditAppendError);
  });
});
