import type { LogicalSettlementTarget, Money, PolicyRuleSnapshot } from "../domain/types";
import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import { resolvePersonalWorkspace, type VerifiedAuthIdentity } from "./workspace";

// 2B-policy: the workspace's editable policy — the budget caps, merchant
// allow/block lists and review thresholds the real policy engine consumes
// (PolicyRuleSnapshot). Stored as one settings row per workspace in
// public.policies; reads fall back to DEFAULT_POLICY_RULES so a workspace that
// has never saved a policy still evaluates against sane defaults.

export const USDC_DECIMALS = 6;

const USDC_TARGET: LogicalSettlementTarget = {
  kind: "logical",
  chainFamily: "base",
  asset: "USDC",
  decimals: USDC_DECIMALS,
};

export function usdcMoney(amountAtomic: string): Money {
  return { amountAtomic, asset: "USDC", settlementRef: USDC_TARGET, decimals: USDC_DECIMALS };
}

// Sensible starting rules for a brand-new workspace. Amounts are atomic USDC
// (6 decimals): 100 / 1,000 / 50 USDC. New merchants require review by default;
// nothing is pre-approved or category-blocked until the owner edits the policy.
export const DEFAULT_POLICY_RULES: PolicyRuleSnapshot = {
  allowedMerchantIds: [],
  blockedMerchantIds: [],
  blockedCategories: [],
  allowedRails: ["base"],
  transactionLimit: usdcMoney("100000000"),
  absoluteHardLimit: usdcMoney("1000000000"),
  reviewThreshold: usdcMoney("50000000"),
  requireReviewForNewMerchant: true,
  allowedArtifactTypes: ["api_result"],
};

export interface WorkspacePolicyView {
  readonly rules: PolicyRuleSnapshot;
  readonly version: number; // 0 when the workspace has never saved a policy
  readonly updatedAt: string | null;
}

interface PolicyRow extends Record<string, unknown> {
  readonly rules: PolicyRuleSnapshot;
  readonly version: number;
  readonly updated_at: string;
}

function toView(row: PolicyRow): WorkspacePolicyView {
  return {
    rules: row.rules,
    version: row.version,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getWorkspacePolicy(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<WorkspacePolicyView> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: workspace.projectId },
    async (client) => {
      const found = await client.query<PolicyRow>(
        "SELECT rules, version, updated_at FROM public.policies WHERE project_id = $1::uuid",
        [workspace.projectId],
      );
      const row = found.rows[0];
      return row ? toView(row) : { rules: DEFAULT_POLICY_RULES, version: 0, updatedAt: null };
    },
  );
}

export async function saveWorkspacePolicy(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  rules: PolicyRuleSnapshot,
): Promise<WorkspacePolicyView> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: workspace.projectId },
    async (client) => {
      const saved = await client.query<PolicyRow>(
        `INSERT INTO public.policies (project_id, version, rules)
         VALUES ($1::uuid, 1, $2::jsonb)
         ON CONFLICT (project_id) DO UPDATE
           SET rules = EXCLUDED.rules,
               version = public.policies.version + 1,
               updated_at = transaction_timestamp()
         RETURNING rules, version, updated_at`,
        [workspace.projectId, JSON.stringify(rules)],
      );
      return toView(saved.rows[0]);
    },
  );
}
