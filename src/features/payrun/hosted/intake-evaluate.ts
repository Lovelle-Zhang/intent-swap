import type { SqlPool } from "../adapters/storage/postgres/sql";
import { buildIntakeEvaluation, type IntakeEvaluation, type IntakeInput } from "./intake";
import type { VerifiedAuthIdentity } from "./workspace";
import { getWorkspacePolicy, type WorkspacePolicyView } from "./workspace-policy";
import {
  agentRemainingAtomic,
  computeRemainingAtomic,
  getAgentSpentTodayAtomic,
  getSpentTodayAtomic,
} from "./workspace-budget";

// The single source of truth for turning a validated intent + the workspace's
// stored policy/budgets/per-agent overrides into a policy decision via the real
// engine. Used by the live intake handler (which then persists) AND by the
// Policy-page dry-run (which does not) — so a simulated decision is identical to
// what a real submission would get. Reads only; persists nothing.
export async function evaluateWorkspaceIntent(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  projectId: string,
  input: IntakeInput,
  now: string,
): Promise<{ evaluation: IntakeEvaluation; policy: WorkspacePolicyView }> {
  const policy = await getWorkspacePolicy(pool, identity);
  const spent = await getSpentTodayAtomic(pool, identity, projectId);
  const remaining = computeRemainingAtomic(
    policy.dailyBudgetAtomic, spent, policy.rules.absoluteHardLimit.amountAtomic,
  );
  const agentSpent = await getAgentSpentTodayAtomic(pool, identity, projectId, input.agentId);
  const agentRemaining = agentRemainingAtomic(
    policy.agentBudgets, input.agentId, agentSpent, policy.rules.absoluteHardLimit.amountAtomic,
  );
  const evaluation = buildIntakeEvaluation(
    input, projectId, policy.rules, { version: policy.version }, now, remaining, agentRemaining,
    policy.agentLimits[input.agentId],
  );
  return { evaluation, policy };
}
