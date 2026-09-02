import type { SqlPool } from "../adapters/storage/postgres/sql";
import type { PayRun } from "../domain/types";
import {
  openWorkspacePersistence,
  type PersonalWorkspaceView,
  type VerifiedAuthIdentity,
} from "./workspace";

// 2B-2: the hosted READ projection. Product surfaces are read-only, so they
// never run the control loop; they project persisted PayRuns. This lists a
// workspace's PayRuns from Postgres and maps each to a lightweight summary for
// the list surface. (Full per-PayRun explanation belongs to the detail slice.)
export interface HostedPayRunSummary {
  readonly payRunId: string;
  readonly status: PayRun["status"];
  readonly agentId: string;
  readonly purpose: string;
  readonly createdAt: string;
  readonly amount: {
    readonly amountAtomic: string;
    readonly asset: string;
    readonly decimals: number;
  };
  readonly policy: { readonly outcome: string; readonly reasonCodes: readonly string[] } | null;
}

export interface HostedWorkspacePayRunsView {
  readonly workspace: PersonalWorkspaceView;
  readonly payRuns: readonly HostedPayRunSummary[];
}

export function projectHostedPayRunSummary(payRun: PayRun): HostedPayRunSummary {
  const decision = payRun.policyDecisions.at(-1) ?? null;
  return {
    payRunId: payRun.id,
    status: payRun.status,
    agentId: payRun.intent.agentId,
    purpose: payRun.intent.purpose,
    createdAt: payRun.intent.createdAt,
    amount: {
      amountAtomic: payRun.intent.quotedAmount.amountAtomic,
      asset: payRun.intent.quotedAmount.asset,
      decimals: payRun.intent.quotedAmount.decimals,
    },
    policy: decision
      ? { outcome: decision.outcome, reasonCodes: [...decision.reasonCodes] }
      : null,
  };
}

export async function listWorkspacePayRuns(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<HostedWorkspacePayRunsView> {
  const { workspace, persistence } = await openWorkspacePersistence(pool, identity);
  try {
    const payRuns = await persistence.payRuns.list(workspace.projectId);
    return { workspace, payRuns: payRuns.map(projectHostedPayRunSummary) };
  } finally {
    await persistence.close();
  }
}
