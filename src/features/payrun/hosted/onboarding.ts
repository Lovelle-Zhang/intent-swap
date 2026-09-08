import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import { resolvePersonalWorkspace, type VerifiedAuthIdentity } from "./workspace";

// First-success activation signals for the Overview "Get started" checklist.
// All three are DERIVED from existing state (no new tables): has the owner
// created an API key, saved a policy, and had at least one intent arrive over
// the real HTTP API (intent.source = 'api', i.e. from their own agent — not a
// canned sandbox run). Once all three are true the checklist is complete and
// the Overview hides it.

export interface OnboardingState {
  readonly hasKey: boolean;
  readonly hasPolicy: boolean;
  readonly hasApiRun: boolean;
  readonly complete: boolean;
}

export async function getOnboardingState(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<OnboardingState> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: workspace.projectId },
    async (client) => {
      const keys = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.api_keys WHERE owner_user_id = $1::uuid",
        [identity.userId],
      );
      const policy = await client.query<{ version: number }>(
        "SELECT version FROM public.policies WHERE project_id = $1::uuid",
        [workspace.projectId],
      );
      const apiRuns = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.pay_runs
          WHERE project_id = $1::uuid
            AND document->'intent'->>'source' = 'api'`,
        [workspace.projectId],
      );
      const hasKey = (keys.rows[0]?.n ?? 0) > 0;
      const hasPolicy = (policy.rows[0]?.version ?? 0) >= 1;
      const hasApiRun = (apiRuns.rows[0]?.n ?? 0) > 0;
      return { hasKey, hasPolicy, hasApiRun, complete: hasKey && hasPolicy && hasApiRun };
    },
  );
}
