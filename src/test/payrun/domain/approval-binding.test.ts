import { describe, expect, it } from "vitest";

import { InvariantViolationError } from "@/features/payrun/domain/errors";
import { recordApprovalDecision } from "@/features/payrun/domain/state-machine";
import type { Approval, ApprovalDecision, ApprovalRequest, DomainActor } from "@/features/payrun/domain/types";
import { buildApproval, buildApprovalDecision, buildApprovalRequest, UPDATED_AT } from "./fixtures";

const requester: DomainActor = { actorId: "requester_001", actorType: "agent" };

function boundRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    ...buildApprovalRequest(),
    agentId: "agent_001",
    purpose: "Purchase a verified API result",
    amountCeiling: buildApprovalRequest().amount,
    policyChecksum: "sha256:policy:001",
    requester,
    ...overrides,
  } as ApprovalRequest;
}

function pending(request = boundRequest()): Approval {
  return { ...buildApproval("pending"), request };
}

function decision(approver: DomainActor, overrides: Partial<ApprovalDecision> = {}): ApprovalDecision {
  return {
    ...buildApprovalDecision("approved"),
    reviewerId: approver.actorId,
    approver,
    ...overrides,
  } as ApprovalDecision;
}

describe("ADR-0005 Approval binding and separation of duties", () => {
  it("rejects requester self-approval", () => {
    expect(() => recordApprovalDecision(pending(), {
      expectedVersion: 1,
      decision: decision({ actorId: requester.actorId, actorType: "user" }),
      updatedAt: UPDATED_AT,
    })).toThrow(InvariantViolationError);
  });

  it.each(["system", "worker"] as const)("rejects %s as a human approver", (actorType) => {
    expect(() => recordApprovalDecision(pending(), {
      expectedVersion: 1,
      decision: decision({ actorId: "executor_001", actorType }),
      updatedAt: UPDATED_AT,
    })).toThrow(InvariantViolationError);
  });

  it("rejects a decision whose immutable scope digest changed", () => {
    expect(() => recordApprovalDecision(pending(), {
      expectedVersion: 1,
      decision: decision({ actorId: "reviewer_001", actorType: "user" }, {
        approvalScopeDigest: "sha256:changed-scope",
      }),
      updatedAt: UPDATED_AT,
    })).toThrow(InvariantViolationError);
  });

  it("records a distinct authenticated human approver", () => {
    const approver = { actorId: "reviewer_001", actorType: "user" } as const;
    const result = recordApprovalDecision(pending(), {
      expectedVersion: 1,
      decision: decision(approver),
      updatedAt: UPDATED_AT,
    });

    expect(result.status).toBe("approved");
    expect(result.decision?.approver).toEqual(approver);
  });
});
