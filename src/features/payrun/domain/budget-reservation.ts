import { InvariantViolationError, VersionConflictError } from "./errors";
import { assertEvidenceCompatible, assertMoney, assertUtcIso, deepFreeze } from "./invariants";
import { budgetReservationSchema } from "./schemas";
import type { BudgetReservation, EvidenceReference } from "./types";

type ReservationInput = Omit<BudgetReservation, "version" | "status" | "createdAt" | "updatedAt">;

export interface ReleaseBudgetReservationCommand {
  readonly expectedVersion: number;
  readonly occurredAt: string;
  readonly reasonCode: string;
  readonly evidence: EvidenceReference;
}

export interface ConsumeBudgetReservationCommand {
  readonly expectedVersion: number;
  readonly occurredAt: string;
  readonly reasonCode: string;
  readonly ledgerJournalId: string;
}

export function activateBudgetReservation(input: ReservationInput, occurredAt: string): BudgetReservation {
  assertUtcIso(occurredAt, "reservation.createdAt");
  assertMoney(input.reservedAmount);
  if (input.budgetKeys.length === 0 || new Set(input.budgetKeys).size !== input.budgetKeys.length) {
    throw new InvariantViolationError("BudgetReservation requires unique budget keys");
  }
  if (Date.parse(input.expiresAt) <= Date.parse(occurredAt)) {
    throw new InvariantViolationError("BudgetReservation expiry must follow activation");
  }
  return deepFreeze(budgetReservationSchema.parse({
    ...input,
    version: 1,
    status: "active",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  }));
}

function assertActive(current: BudgetReservation, expectedVersion: number, occurredAt: string): void {
  if (current.version !== expectedVersion) {
    throw new VersionConflictError(expectedVersion, current.version, current.id);
  }
  if (current.status !== "active") {
    throw new InvariantViolationError("Only an active BudgetReservation can transition", {
      reservationId: current.id,
      status: current.status,
    });
  }
  assertUtcIso(occurredAt, "reservation.updatedAt");
  if (Date.parse(occurredAt) < Date.parse(current.updatedAt)) {
    throw new InvariantViolationError("BudgetReservation time cannot move backwards");
  }
}

export function releaseBudgetReservation(
  current: BudgetReservation,
  command: ReleaseBudgetReservationCommand,
): BudgetReservation {
  assertActive(current, command.expectedVersion, command.occurredAt);
  if (!command.reasonCode) throw new InvariantViolationError("Reservation release reason is required");
  assertEvidenceCompatible(current.environment, command.evidence);
  if (!command.evidence.kind.endsWith("safe_release_evidence")) {
    throw new InvariantViolationError("Reservation release requires safe-release evidence");
  }
  return deepFreeze(budgetReservationSchema.parse({
    ...current,
    version: current.version + 1,
    status: "released",
    terminalReasonCode: command.reasonCode,
    terminalEvidence: command.evidence,
    updatedAt: command.occurredAt,
  }));
}

export function consumeBudgetReservation(
  current: BudgetReservation,
  command: ConsumeBudgetReservationCommand,
): BudgetReservation {
  assertActive(current, command.expectedVersion, command.occurredAt);
  if (!command.reasonCode || !command.ledgerJournalId) {
    throw new InvariantViolationError("Reservation consumption requires reason and Ledger journal");
  }
  return deepFreeze(budgetReservationSchema.parse({
    ...current,
    version: current.version + 1,
    status: "consumed",
    terminalReasonCode: command.reasonCode,
    terminalEvidence: { ledgerJournalId: command.ledgerJournalId },
    updatedAt: command.occurredAt,
  }));
}
