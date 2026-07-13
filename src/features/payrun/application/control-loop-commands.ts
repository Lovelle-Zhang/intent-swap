import type { DomainActor } from "../domain/types";

export const SANDBOX_SCENARIO_IDS = [
  "allowed",
  "needs_review",
  "blocked",
  "funding_mismatch",
] as const;

export type SandboxScenarioId = (typeof SANDBOX_SCENARIO_IDS)[number];

export interface ExecuteSandboxPayRunCommand {
  readonly projectId: string;
  readonly scenarioId: SandboxScenarioId;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly requester: DomainActor;
}
