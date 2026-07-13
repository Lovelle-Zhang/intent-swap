import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  ApprovalRepository,
  AuditEventRepository,
  BudgetReservationRepository,
  DomainOutboxRepository,
  FundingPreparationRepository,
  IdempotencyRepository,
  LedgerRepository,
  PayRunRepository,
  PayRunUnitOfWork,
  PayRunUnitOfWorkContext,
  PaymentExecutionRepository,
  PolicyDecisionPort,
} from "@/features/payrun/application/ports";
import type {
  AggregateRoot,
  Approval,
  BudgetReservation,
  FundingPreparation,
  LedgerJournal,
  PayRun,
  PayRunStatus,
  PaymentExecution,
  PolicyEvaluationRequest,
} from "@/features/payrun/domain/types";
import {
  OTHER_PROJECT_ID,
  PAY_RUN_ID,
  PROJECT_ID,
  buildApproval,
  buildAuditEvent,
  buildBudgetReservation,
  buildFundingPreparation,
  buildIdempotencyRecord,
  buildLedgerJournal,
  buildOutboxEvent,
  buildPayRunAt,
  buildPaymentExecution,
} from "./fixtures";

describe("project-scoped application ports", () => {
  it("requires Project, ID, expectedVersion, expectedStatus, and next value for PayRun CAS", () => {
    expectTypeOf<Parameters<PayRunRepository["compareAndSet"]>>().toEqualTypeOf<
      [string, string, number, PayRunStatus, PayRun]
    >();
  });

  it("requires expectedVersion and expectedStatus for every mutable stage aggregate", () => {
    expectTypeOf<Parameters<ApprovalRepository["compareAndSet"]>>().toEqualTypeOf<
      [string, string, number, Approval["status"], Approval]
    >();
    expectTypeOf<Parameters<BudgetReservationRepository["compareAndSet"]>>().toEqualTypeOf<
      [string, string, number, BudgetReservation["status"], BudgetReservation]
    >();
    expectTypeOf<Parameters<FundingPreparationRepository["compareAndSet"]>>().toEqualTypeOf<
      [string, string, number, FundingPreparation["status"], FundingPreparation]
    >();
    expectTypeOf<Parameters<PaymentExecutionRepository["compareAndSet"]>>().toEqualTypeOf<
      [string, string, number, PaymentExecution["status"], PaymentExecution]
    >();
    expectTypeOf<FundingPreparation>().toMatchTypeOf<AggregateRoot>();
    expectTypeOf<PaymentExecution>().toMatchTypeOf<AggregateRoot>();
    expectTypeOf<Approval>().toMatchTypeOf<AggregateRoot>();
    expectTypeOf<BudgetReservation>().toMatchTypeOf<AggregateRoot>();
    expectTypeOf<LedgerJournal>().toMatchTypeOf<AggregateRoot>();
  });

  it("passes explicit project scope through repository operations", async () => {
    const compareAndSet = vi.fn<PayRunRepository["compareAndSet"]>(async () => ({
      kind: "updated",
      value: buildPayRunAt("policy_allowed"),
    }));
    const repository: PayRunRepository = {
      get: async () => null,
      list: async () => [],
      insert: async () => undefined,
      compareAndSet,
    };
    const next = buildPayRunAt("policy_allowed");

    await repository.compareAndSet(PROJECT_ID, PAY_RUN_ID, 7, "policy_evaluating", next);

    expect(compareAndSet).toHaveBeenCalledWith(
      PROJECT_ID,
      PAY_RUN_ID,
      7,
      "policy_evaluating",
      next,
    );
    expect(compareAndSet).not.toHaveBeenCalledWith(
      OTHER_PROJECT_ID,
      PAY_RUN_ID,
      7,
      "policy_evaluating",
      next,
    );
  });

  it("exposes append/read-only Ledger, Audit, and Domain Outbox contracts", () => {
    expectTypeOf<keyof LedgerRepository>().toEqualTypeOf<
      "get" | "findByProof" | "findByExternalReference" | "append"
    >();
    expectTypeOf<keyof AuditEventRepository>().toEqualTypeOf<"list" | "append">();
    expectTypeOf<keyof DomainOutboxRepository>().toEqualTypeOf<"get" | "append">();
  });

  it("scopes idempotency by Project, command type, and key", () => {
    expectTypeOf<Parameters<IdempotencyRepository["get"]>>().toEqualTypeOf<
      [string, string, string]
    >();
    expectTypeOf<Parameters<IdempotencyRepository["compareAndSet"]>>().toEqualTypeOf<
      [string, string, number, "in_progress" | "completed" | "unknown", ReturnType<typeof buildIdempotencyRecord>]
    >();
  });

  it("requires the deterministic Policy port to receive the full authoritative snapshot", () => {
    expectTypeOf<Parameters<PolicyDecisionPort["evaluate"]>>().toEqualTypeOf<
      [PolicyEvaluationRequest]
    >();
  });

  it("defines one project-scoped Unit of Work for all transition records", async () => {
    const payRunRepository: PayRunRepository = {
      get: async () => null,
      list: async () => [],
      insert: async () => undefined,
      compareAndSet: async (_projectId, _id, _version, _status, next) => ({
        kind: "updated",
        value: next,
      }),
    };
    const approvalRepository: ApprovalRepository = {
      get: async () => null,
      insert: async () => undefined,
      compareAndSet: async (_projectId, _id, _version, _status, next) => ({
        kind: "updated",
        value: next,
      }),
    };
    const fundingPreparationRepository: FundingPreparationRepository = {
      get: async () => null,
      insert: async () => undefined,
      compareAndSet: async (_projectId, _id, _version, _status, next) => ({
        kind: "updated",
        value: next,
      }),
    };
    const budgetReservationRepository: BudgetReservationRepository = {
      get: async () => null,
      listActive: async () => [],
      insert: async () => undefined,
      compareAndSet: async (_projectId, _id, _version, _status, next) => ({
        kind: "updated",
        value: next,
      }),
    };
    const paymentExecutionRepository: PaymentExecutionRepository = {
      get: async () => null,
      insert: async () => undefined,
      compareAndSet: async (_projectId, _id, _version, _status, next) => ({
        kind: "updated",
        value: next,
      }),
    };
    const ledgerRepository: LedgerRepository = {
      get: async () => null,
      findByProof: async () => null,
      findByExternalReference: async () => null,
      append: async () => undefined,
    };
    const auditEventRepository: AuditEventRepository = {
      list: async () => [],
      append: async () => undefined,
    };
    const domainOutboxRepository: DomainOutboxRepository = {
      get: async () => null,
      append: async () => undefined,
    };
    const idempotencyRepository: IdempotencyRepository = {
      get: async () => null,
      insert: async () => undefined,
      compareAndSet: async (_projectId, _id, _version, _state, next) => ({
        kind: "updated",
        value: next,
      }),
    };
    const context = {
      payRuns: payRunRepository,
      approvals: approvalRepository,
      budgetReservations: budgetReservationRepository,
      fundingPreparations: fundingPreparationRepository,
      paymentExecutions: paymentExecutionRepository,
      ledger: ledgerRepository,
      auditEvents: auditEventRepository,
      domainOutbox: domainOutboxRepository,
      idempotency: idempotencyRepository,
    } satisfies PayRunUnitOfWorkContext;
    const executedProjects: string[] = [];
    const unitOfWork: PayRunUnitOfWork = {
      async execute<T>(projectId: string, operation: (value: PayRunUnitOfWorkContext) => Promise<T>) {
        executedProjects.push(projectId);
        return operation(context);
      },
    };

    const result = await unitOfWork.execute(PROJECT_ID, async (repositories) => {
      await repositories.auditEvents.append(PROJECT_ID, buildAuditEvent());
      await repositories.domainOutbox.append(PROJECT_ID, buildOutboxEvent());
      await repositories.ledger.append(PROJECT_ID, buildLedgerJournal());
      await repositories.approvals.insert(PROJECT_ID, buildApproval());
      await repositories.budgetReservations.insert(PROJECT_ID, buildBudgetReservation());
      await repositories.fundingPreparations.insert(PROJECT_ID, buildFundingPreparation());
      await repositories.paymentExecutions.insert(PROJECT_ID, buildPaymentExecution());
      return "committed" as const;
    });

    expect(result).toBe("committed");
    expect(executedProjects).toEqual([PROJECT_ID]);
  });
});
