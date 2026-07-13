import { describe, expect, it } from "vitest";

import {
  LEGAL_TRANSITIONS,
  PAY_RUN_STATUSES,
  TERMINAL_PAY_RUN_STATUSES,
  canTransition,
  createPayRun,
  recordApprovalDecision,
  transitionPayRun,
} from "@/features/payrun/domain/state-machine";
import {
  ApprovalConflictError,
  IntentExpiredError,
  InvalidTransitionError,
  InvariantViolationError,
  TerminalStateError,
  VersionConflictError,
} from "@/features/payrun/domain/errors";
import type {
  PayRunStatus,
  PayRunTransitionCommand,
} from "@/features/payrun/domain/types";
import {
  CREATED_AT,
  EXPIRES_AT,
  PAY_RUN_ID,
  PROJECT_ID,
  TRANSITION_AT,
  buildApproval,
  buildApprovalDecision,
  buildFundingPreparation,
  buildIntent,
  buildLedgerJournal,
  buildPayRunAt,
  buildPaymentExecution,
  buildTransitionCommand,
} from "./fixtures";

const normativeTransitions: Readonly<Record<PayRunStatus, readonly PayRunStatus[]>> = {
  intent_recorded: ["policy_evaluating", "cancellation_pending"],
  policy_evaluating: [
    "policy_evaluating",
    "policy_allowed",
    "pending_review",
    "blocked",
    "failed",
    "expired",
    "cancellation_pending",
  ],
  policy_allowed: [
    "policy_evaluating",
    "funding_preparing",
    "expired",
    "cancellation_pending",
  ],
  pending_review: ["approved", "denied", "expired", "cancellation_pending"],
  approved: ["policy_evaluating", "expired", "cancellation_pending"],
  funding_preparing: [
    "funding_preparing",
    "funding_prepared",
    "failed",
    "expired",
    "cancellation_pending",
  ],
  funding_prepared: ["payment_executing", "expired", "failed", "cancellation_pending"],
  payment_executing: ["payment_succeeded", "payment_unknown", "failed"],
  payment_unknown: ["payment_unknown", "payment_succeeded", "failed"],
  payment_succeeded: ["proof_collecting"],
  proof_collecting: ["proof_collecting", "proof_collected"],
  proof_collected: ["ledger_recording"],
  ledger_recording: ["ledger_recording", "completed"],
  completed: [],
  blocked: [],
  denied: [],
  expired: [],
  cancellation_pending: ["cancellation_pending", "cancelled"],
  cancelled: [],
  failed: [],
};

describe("canonical PayRun transition table", () => {
  it("contains exactly the 20 canonical states and 43 normative edges", () => {
    expect(PAY_RUN_STATUSES).toEqual([
      "intent_recorded",
      "policy_evaluating",
      "policy_allowed",
      "pending_review",
      "approved",
      "funding_preparing",
      "funding_prepared",
      "payment_executing",
      "payment_unknown",
      "payment_succeeded",
      "proof_collecting",
      "proof_collected",
      "ledger_recording",
      "completed",
      "blocked",
      "denied",
      "expired",
      "cancellation_pending",
      "cancelled",
      "failed",
    ]);
    expect(LEGAL_TRANSITIONS).toEqual(normativeTransitions);
    expect(Object.values(LEGAL_TRANSITIONS).flat()).toHaveLength(43);
  });

  for (const from of Object.keys(normativeTransitions) as PayRunStatus[]) {
    for (const to of Object.keys(normativeTransitions) as PayRunStatus[]) {
      const legal = normativeTransitions[from].includes(to);
      it(`${legal ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        const current = buildPayRunAt(from);
        const command = buildTransitionCommand(current, to);

        expect(canTransition(from, to)).toBe(legal);
        if (legal) {
          const result = transitionPayRun(current, command);
          expect(result.payRun.status).toBe(to);
          expect(result.payRun.version).toBe(current.version + 1);
        } else if ((TERMINAL_PAY_RUN_STATUSES as readonly PayRunStatus[]).includes(from)) {
          expect(() => transitionPayRun(current, command)).toThrowError(TerminalStateError);
        } else {
          expect(() => transitionPayRun(current, command)).toThrowError(InvalidTransitionError);
        }
      });
    }
  }
});

describe("PayRun transition protocol", () => {
  it("creates the genesis intent_recorded aggregate and mandatory transition records", () => {
    const result = createPayRun({
      payRunId: PAY_RUN_ID,
      projectId: PROJECT_ID,
      environment: "sandbox",
      intent: buildIntent(),
      createdAt: CREATED_AT,
      creationIdempotencyKey: "create-payrun-001",
      requestHash: "sha256:create-payrun:001",
      idempotencyRetentionUntil: "2027-07-12T00:00:00.000Z",
      idempotencyRecordId: "idempotency_create_001",
      auditEventId: "audit_create_001",
      outboxEventId: "outbox_create_001",
      correlationId: "correlation_create_001",
      actor: { actorId: "agent_001", actorType: "agent" },
    });

    expect(result.payRun).toMatchObject({
      id: PAY_RUN_ID,
      projectId: PROJECT_ID,
      status: "intent_recorded",
      version: 1,
      lastAuditSequence: 1,
      lastOutboxSequence: 1,
    });
    expect(result.auditEvent).toMatchObject({ beforeVersion: 0, afterVersion: 1, sequence: 1 });
    expect(result.outboxEvent).toMatchObject({ aggregateVersion: 1, sequence: 1 });
    expect(result.idempotencyRecord).toMatchObject({
      state: "completed",
      resultResourceId: PAY_RUN_ID,
      resultVersion: 1,
      retentionUntil: "2027-07-12T00:00:00.000Z",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.payRun)).toBe(true);
  });

  it("increments PayRun version exactly once and emits matching Audit/Outbox records", () => {
    const current = buildPayRunAt("intent_recorded");
    const result = transitionPayRun(
      current,
      buildTransitionCommand(current, "policy_evaluating"),
    );

    expect(result.payRun.version).toBe(8);
    expect(result.payRun.updatedAt).toBe(TRANSITION_AT);
    expect(result.auditEvent).toMatchObject({
      sequence: 8,
      beforeVersion: 7,
      afterVersion: 8,
    });
    expect(result.outboxEvent).toMatchObject({
      sequence: 8,
      aggregateVersion: 8,
    });
    expect(result.idempotencyRecord.resultVersion).toBe(8);
  });

  it("requires a server-authoritative idempotency retention boundary after command time", () => {
    const current = buildPayRunAt("intent_recorded");
    expect(() =>
      transitionPayRun(
        current,
        buildTransitionCommand(current, "policy_evaluating", {
          idempotencyRetentionUntil: TRANSITION_AT,
        }),
      ),
    ).toThrowError(InvariantViolationError);
  });

  it("preserves aggregate identity and advances each mutable stage exactly once", () => {
    const preparing = buildPayRunAt("funding_preparing");
    const invalidFunding = buildFundingPreparation("not_required", {
      id: "funding_replaced",
      version: preparing.fundingPreparation!.version + 1,
    });
    expect(() =>
      transitionPayRun(
        preparing,
        buildTransitionCommand(preparing, "funding_prepared", {
          data: { fundingPreparation: invalidFunding },
        }),
      ),
    ).toThrowError(InvariantViolationError);

    const executing = buildPayRunAt("payment_executing");
    const invalidPayment = buildPaymentExecution("unknown", {
      version: executing.paymentExecution!.version + 2,
    });
    expect(() =>
      transitionPayRun(
        executing,
        buildTransitionCommand(executing, "payment_unknown", {
          data: { paymentExecution: invalidPayment },
        }),
      ),
    ).toThrowError(InvariantViolationError);

    expect(() =>
      transitionPayRun(
        preparing,
        buildTransitionCommand(preparing, "failed", {
          data: {
            ...buildTransitionCommand(preparing, "failed").data,
            fundingPreparation: buildFundingPreparation("failed", {
              id: "funding_replaced",
              version: preparing.fundingPreparation!.version + 1,
            }),
          },
        }),
      ),
    ).toThrowError(InvariantViolationError);

    const pending = buildPayRunAt("pending_review");
    expect(() =>
      transitionPayRun(
        pending,
        buildTransitionCommand(pending, "approved", {
          data: {
            approval: buildApproval("approved", {
              version: pending.approval!.version + 2,
              request: pending.approval!.request,
            }),
          },
        }),
      ),
    ).toThrowError(InvariantViolationError);
  });

  it("keeps PaymentInstruction immutable across unknown reconciliation", () => {
    const executing = buildPayRunAt("payment_executing");
    const changed = buildPaymentExecution("unknown", {
      version: executing.paymentExecution!.version + 1,
      instruction: {
        ...executing.paymentExecution!.instruction,
        instructionHash: "sha256:changed-instruction",
      },
      attempts: [
        {
          ...buildPaymentExecution("unknown").attempts[0],
          instructionHash: "sha256:changed-instruction",
        },
      ],
    });
    expect(() =>
      transitionPayRun(
        executing,
        buildTransitionCommand(executing, "payment_unknown", {
          data: { paymentExecution: changed },
        }),
      ),
    ).toThrowError(InvariantViolationError);
  });

  it("returns no mutated state or transition records on a version conflict", () => {
    const current = Object.freeze(buildPayRunAt("intent_recorded"));
    const snapshot = structuredClone(current);
    const command = buildTransitionCommand(current, "policy_evaluating", {
      expectedVersion: current.version - 1,
    });

    expect(() => transitionPayRun(current, command)).toThrowError(VersionConflictError);
    expect(current).toEqual(snapshot);
    expect(current.status).toBe("intent_recorded");
  });

  it("does not expose a writable PayRun status", () => {
    const payRun = transitionPayRun(
      buildPayRunAt("intent_recorded"),
      buildTransitionCommand(buildPayRunAt("intent_recorded"), "policy_evaluating"),
    ).payRun;

    if (false) {
      // @ts-expect-error PayRun status is readonly; only transitionPayRun may change it.
      payRun.status = "completed";
    }
    expect(Reflect.set(payRun, "status", "completed")).toBe(false);
    expect(payRun.status).toBe("policy_evaluating");
  });

  it("clones returned state without freezing caller-owned command artifacts", () => {
    const intent = buildIntent();
    createPayRun({
      payRunId: PAY_RUN_ID,
      projectId: PROJECT_ID,
      environment: "sandbox",
      intent,
      createdAt: CREATED_AT,
      creationIdempotencyKey: "create-clone-test",
      requestHash: "sha256:create-clone-test",
      idempotencyRetentionUntil: "2027-07-12T00:00:00.000Z",
      idempotencyRecordId: "idempotency_clone_test",
      auditEventId: "audit_clone_test",
      outboxEventId: "outbox_clone_test",
      correlationId: "correlation_clone_test",
      actor: { actorId: "agent_001", actorType: "agent" },
    });
    expect(Object.isFrozen(intent)).toBe(false);

    const allowed = buildPayRunAt("policy_allowed");
    const funding = buildFundingPreparation("requested");
    transitionPayRun(
      allowed,
      buildTransitionCommand(allowed, "funding_preparing", {
        data: { fundingPreparation: funding },
      }),
    );
    expect(Object.isFrozen(funding)).toBe(false);
    expect(Object.isFrozen(funding.source)).toBe(false);
  });

  it("requires target-state evidence instead of manufacturing it", () => {
    const evaluating = buildPayRunAt("policy_evaluating");
    const missingDecision = buildTransitionCommand(evaluating, "policy_allowed", {
      data: {},
    });
    expect(() => transitionPayRun(evaluating, missingDecision)).toThrowError(
      InvariantViolationError,
    );

    const preparing = buildPayRunAt("funding_preparing");
    const plannedOnly = buildTransitionCommand(preparing, "funding_prepared", {
      data: { fundingPreparation: buildFundingPreparation("planned") },
    });
    expect(() => transitionPayRun(preparing, plannedOnly)).toThrowError(
      InvariantViolationError,
    );

    const recording = buildPayRunAt("ledger_recording");
    const noJournal = buildTransitionCommand(recording, "completed", { data: {} });
    expect(() => transitionPayRun(recording, noJournal)).toThrowError(
      InvariantViolationError,
    );
  });

  it("never permits pending_review to bypass Approval and policy recheck", () => {
    const pending = buildPayRunAt("pending_review");
    for (const forbidden of [
      "policy_allowed",
      "funding_preparing",
      "funding_prepared",
      "payment_executing",
      "proof_collecting",
      "completed",
    ] as PayRunStatus[]) {
      expect(() =>
        transitionPayRun(pending, buildTransitionCommand(pending, forbidden)),
      ).toThrowError(InvalidTransitionError);
    }

    const approved = transitionPayRun(
      pending,
      buildTransitionCommand(pending, "approved"),
    ).payRun;
    expect(() =>
      transitionPayRun(approved, buildTransitionCommand(approved, "funding_preparing")),
    ).toThrowError(InvalidTransitionError);
    expect(canTransition("approved", "policy_evaluating")).toBe(true);
  });

  it("never permits blocked to leave its terminal state", () => {
    const blocked = buildPayRunAt("blocked");
    for (const to of PAY_RUN_STATUSES) {
      expect(() => transitionPayRun(blocked, buildTransitionCommand(blocked, to))).toThrowError(
        TerminalStateError,
      );
    }
  });

  it("rejects approval of an expired intent", () => {
    const pending = {
      ...buildPayRunAt("pending_review"),
      intent: buildIntent({ expiresAt: TRANSITION_AT }),
    };
    expect(() =>
      transitionPayRun(pending, buildTransitionCommand(pending, "approved")),
    ).toThrowError(IntentExpiredError);
  });

  it("records one terminal human decision with Approval CAS", () => {
    const pending = buildApproval("pending");
    const approved = recordApprovalDecision(pending, {
      expectedVersion: pending.version,
      decision: buildApprovalDecision("approved"),
      updatedAt: TRANSITION_AT,
    });

    expect(approved.status).toBe("approved");
    expect(approved.version).toBe(pending.version + 1);
    expect(pending.status).toBe("pending");
    expect(() =>
      recordApprovalDecision(approved, {
        expectedVersion: approved.version,
        decision: buildApprovalDecision("denied"),
        updatedAt: TRANSITION_AT,
      }),
    ).toThrowError(ApprovalConflictError);
  });

  it("uses expectedVersion independently from Approval creation metadata", () => {
    const pending = buildApproval("pending", {
      request: {
        ...buildApproval("pending").request,
        createdAtPayRunVersion: 3,
      },
      version: 9,
    });
    expect(() =>
      recordApprovalDecision(pending, {
        expectedVersion: 3,
        decision: buildApprovalDecision("approved"),
        updatedAt: TRANSITION_AT,
      }),
    ).toThrowError(VersionConflictError);
  });

  it("validates a completed transition against the committed Ledger journal", () => {
    const recording = buildPayRunAt("ledger_recording");
    const invalidJournal = buildLedgerJournal({
      entries: [
        ...buildLedgerJournal().entries.slice(0, 1),
        { ...buildLedgerJournal().entries[1], creditAtomic: "1" },
      ],
    });
    const command: PayRunTransitionCommand = {
      ...buildTransitionCommand(recording, "completed"),
      data: { ledgerJournal: invalidJournal },
    };

    expect(() => transitionPayRun(recording, command)).toThrowError(InvariantViolationError);
  });

  it("rejects genesis creation when the immutable intent is already expired", () => {
    expect(() =>
      createPayRun({
        payRunId: PAY_RUN_ID,
        projectId: PROJECT_ID,
        environment: "sandbox",
        intent: buildIntent({ expiresAt: CREATED_AT }),
        createdAt: CREATED_AT,
        creationIdempotencyKey: "create-expired",
        requestHash: "sha256:create-expired",
        idempotencyRetentionUntil: "2027-07-12T00:00:00.000Z",
        idempotencyRecordId: "idempotency_create_expired",
        auditEventId: "audit_create_expired",
        outboxEventId: "outbox_create_expired",
        correlationId: "correlation_create_expired",
        actor: { actorId: "agent_001", actorType: "agent" },
      }),
    ).toThrowError(IntentExpiredError);
    expect(EXPIRES_AT > CREATED_AT).toBe(true);
  });
});
