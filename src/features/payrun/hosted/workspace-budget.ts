import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import { resolvePersonalWorkspace, type VerifiedAuthIdentity } from "./workspace";
import { getWorkspacePolicy } from "./workspace-policy";

// budget-ledger: a workspace's DAILY (UTC) spend cap. "Spent today" is DERIVED
// from pay_runs — no ledger table — so this module only reads. It sums the
// quoted amounts of runs that were AUTHORIZED today; pending/blocked/denied runs
// never counted against the cap. ZenFix never moves funds; this only shapes the
// project budget snapshot the real policy engine already evaluates.

// A run is "authorized" once the engine allowed it (directly or via approval) or
// the agent reported an execution against it. pending_review/blocked/denied do
// NOT consume budget.
const AUTHORIZED_STATUSES = ["policy_allowed", "approved", "execution_reported"];

export async function getSpentTodayAtomic(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  projectId: string,
): Promise<string> {
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: projectId },
    async (client) => {
      const result = await client.query<{ spent: string }>(
        // Timezone-robust day boundary: truncate now()-as-UTC to the day, then
        // re-anchor to UTC as a timestamptz so we never depend on the session
        // TimeZone setting.
        `SELECT COALESCE(SUM((document->'intent'->'quotedAmount'->>'amountAtomic')::numeric),0)::text AS spent
           FROM public.pay_runs
          WHERE project_id = $1::uuid
            AND status = ANY($2::text[])
            AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')`,
        [projectId, AUTHORIZED_STATUSES],
      );
      return result.rows[0]?.spent ?? "0";
    },
  );
}

export function computeRemainingAtomic(
  dailyBudgetAtomic: string,
  spentAtomic: string,
  hardLimitAtomic: string,
): string {
  if (dailyBudgetAtomic === "0") return hardLimitAtomic;
  const remaining = BigInt(dailyBudgetAtomic) - BigInt(spentAtomic);
  return remaining < 0n ? "0" : remaining.toString();
}

export interface BudgetState {
  readonly dailyBudgetAtomic: string;
  readonly spentTodayAtomic: string;
  readonly remainingAtomic: string;
  readonly unlimited: boolean;
}

export async function getBudgetState(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<BudgetState> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  const policy = await getWorkspacePolicy(pool, identity);
  const spentTodayAtomic = await getSpentTodayAtomic(pool, identity, workspace.projectId);
  const remainingAtomic = computeRemainingAtomic(
    policy.dailyBudgetAtomic,
    spentTodayAtomic,
    policy.rules.absoluteHardLimit.amountAtomic,
  );
  return {
    dailyBudgetAtomic: policy.dailyBudgetAtomic,
    spentTodayAtomic,
    remainingAtomic,
    unlimited: policy.dailyBudgetAtomic === "0",
  };
}
