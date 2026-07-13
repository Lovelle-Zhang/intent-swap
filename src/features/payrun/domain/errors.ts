export type PayRunDomainErrorCode =
  | "schema_invalid"
  | "invalid_transition"
  | "terminal_state"
  | "version_conflict"
  | "invariant_violation"
  | "project_scope_violation"
  | "idempotency_conflict"
  | "audit_append_violation"
  | "intent_expired"
  | "evidence_environment_mismatch"
  | "approval_conflict";

export class PayRunDomainError extends Error {
  readonly code: PayRunDomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: PayRunDomainErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
export class SchemaValidationError extends PayRunDomainError {
  constructor(message: string, details: Readonly<Record<string, unknown>> = {}) {
    super("schema_invalid", message, details);
  }
}

export class InvalidTransitionError extends PayRunDomainError {
  constructor(from: string, to: string) {
    super("invalid_transition", `Illegal PayRun transition: ${from} -> ${to}`, { from, to });
  }
}

export class TerminalStateError extends PayRunDomainError {
  constructor(state: string) {
    super("terminal_state", `Terminal PayRun state cannot transition: ${state}`, { state });
  }
}

export class VersionConflictError extends PayRunDomainError {
  constructor(expectedVersion: number, actualVersion: number, aggregateId?: string) {
    super(
      "version_conflict",
      `Expected aggregate version ${expectedVersion}, received ${actualVersion}`,
      { expectedVersion, actualVersion, aggregateId },
    );
  }
}

export class InvariantViolationError extends PayRunDomainError {
  constructor(message: string, details: Readonly<Record<string, unknown>> = {}) {
    super("invariant_violation", message, details);
  }
}

export class ProjectScopeError extends PayRunDomainError {
  constructor(expectedProjectId: string, actualProjectId: string) {
    super("project_scope_violation", "Project-scoped record does not belong to the PayRun Project", {
      expectedProjectId,
      actualProjectId,
    });
  }
}

export class IdempotencyConflictError extends PayRunDomainError {
  constructor(commandType: string, key: string) {
    super("idempotency_conflict", "Idempotency key was reused with a different request hash", {
      commandType,
      key,
    });
  }
}

export class AuditAppendError extends PayRunDomainError {
  constructor(message: string, details: Readonly<Record<string, unknown>> = {}) {
    super("audit_append_violation", message, details);
  }
}

export class IntentExpiredError extends PayRunDomainError {
  constructor(expiresAt: string, observedAt: string) {
    super("intent_expired", "Intent or Approval is no longer valid", { expiresAt, observedAt });
  }
}

export class EvidenceEnvironmentError extends PayRunDomainError {
  constructor(expectedEnvironment: string, actualEnvironment: string) {
    super(
      "evidence_environment_mismatch",
      "Evidence environment cannot be mixed across Sandbox and guarded execution",
      { expectedEnvironment, actualEnvironment },
    );
  }
}

export class ApprovalConflictError extends PayRunDomainError {
  constructor(approvalId: string, status: string) {
    super("approval_conflict", "Approval already has a terminal decision", {
      approvalId,
      status,
    });
  }
}
