import type { PilotScenarioName, PilotScenarioView, PilotSessionView } from "../pilot/session-contracts";
import { addAtomicAmounts } from "./money";

export type PrimaryStatus = "Allowed" | "Needs Review" | "Blocked" | "Completed" | "Failed";
export type LifecycleStageStatus = "completed" | "pending" | "blocked" | "not-applicable";

export const SCENARIO_LABELS: Readonly<Record<PilotScenarioName, string>> = {
  allowed: "Allowed",
  needs_review: "Needs Review",
  blocked: "Blocked",
  funding_mismatch: "Funding Mismatch",
};

export function getPrimaryStatus(scenario: PilotScenarioView): PrimaryStatus {
  if (scenario.actualFinalStatus === "completed") return "Completed";
  if (scenario.actualFinalStatus === "pending_review") return "Needs Review";
  return "Blocked";
}

export function getDecisionSummary(scenario: PilotScenarioView): string {
  if (scenario.policy.outcome === "allowed") return "Policy allowed this controlled sandbox payment.";
  if (scenario.policy.outcome === "needs_review") return "Human review is required before any downstream execution.";
  return "Policy blocked this request before approval or execution.";
}

export function getPilotMetrics(session: PilotSessionView) {
  const completed = session.scenarios.filter((scenario) => scenario.actualFinalStatus === "completed");
  const first = completed[0]?.amount ?? session.scenarios[0]?.amount ?? { decimals: 0, asset: "" };
  if (completed.some((scenario) => scenario.amount.asset !== first.asset || scenario.amount.decimals !== first.decimals)) {
    throw new Error("Controlled spend cannot combine different canonical assets");
  }
  return {
    total: session.scenarios.length,
    completed: completed.length,
    needsReview: session.scenarios.filter((scenario) => scenario.actualFinalStatus === "pending_review").length,
    blocked: session.scenarios.filter((scenario) => scenario.actualFinalStatus === "blocked").length,
    controlledSpend: {
      amountAtomic: addAtomicAmounts(completed.map((scenario) => scenario.amount.amountAtomic)),
      decimals: first.decimals,
      asset: first.asset,
    },
  };
}

export function getPolicyHealth(session: PilotSessionView) {
  const checks = session.scenarios.flatMap((scenario) => scenario.policy.checks);
  const evidence = checks.filter((check) => check.ruleClass === "evidence");
  return {
    passed: checks.filter((check) => check.outcome === "pass").length,
    review: checks.filter((check) => check.outcome === "review").length,
    blocked: checks.filter((check) => check.outcome === "block").length,
    evidencePassed: evidence.filter((check) => check.outcome === "pass").length,
    evidenceTotal: evidence.length,
  };
}

export function getLifecycleStages(scenario: PilotScenarioView) {
  const downstream: LifecycleStageStatus = scenario.actualFinalStatus === "completed" ? "completed" : "not-applicable";
  const policy: LifecycleStageStatus = scenario.actualFinalStatus === "blocked" ? "blocked" : "completed";
  const approval: LifecycleStageStatus = scenario.actualFinalStatus === "pending_review" ? "pending" : "not-applicable";
  return [
    { label: "Intent", status: "completed" as const },
    { label: "Policy", status: policy },
    { label: "Approval", status: approval },
    { label: "Funding", status: downstream },
    { label: "Payment", status: downstream },
    { label: "Proof", status: downstream },
    { label: "Ledger", status: downstream },
  ];
}

export function filterPilotScenarios(
  scenarios: readonly PilotScenarioView[],
  filters: { readonly status?: string; readonly scenario?: string },
): readonly PilotScenarioView[] {
  const validStatuses = new Set(["completed", "pending_review", "blocked"]);
  if (filters.status && !validStatuses.has(filters.status)) return [];
  const validScenarios = new Set(Object.keys(SCENARIO_LABELS));
  if (filters.scenario && !validScenarios.has(filters.scenario)) return [];
  return scenarios.filter((scenario) =>
    (!filters.status || scenario.actualFinalStatus === filters.status)
    && (!filters.scenario || scenario.name === filters.scenario));
}

export function findScenarioByPayRunId(session: PilotSessionView, payRunId: string): PilotScenarioView | null {
  return session.scenarios.find((scenario) => scenario.payRunId === payRunId) ?? null;
}
