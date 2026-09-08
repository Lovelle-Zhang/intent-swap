import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import { resolvePersonalWorkspace, type VerifiedAuthIdentity } from "./workspace";

// Overview control-plane read model. Pure derived reads over pay_runs — no
// ledger, no state changes. "Today" is the current UTC day; the boundary is
// computed timezone-robustly (truncate now()-as-UTC to the day, re-anchor to
// UTC as a timestamptz) so it never depends on the session TimeZone.

export interface OverviewStats {
  readonly today: {
    readonly allowed: number;
    readonly needsReview: number;
    readonly blocked: number;
    readonly executed: number;
  };
  readonly pendingReview: readonly {
    readonly payRunId: string;
    readonly agentId: string;
    readonly purpose: string;
    readonly amountAtomic: string;
    readonly asset: string;
    readonly createdAt: string;
  }[];
  readonly byAgent: readonly {
    readonly agentId: string;
    readonly authorizedAtomic: string;
    readonly allowed: number;
    readonly needsReview: number;
    readonly blocked: number;
    readonly executed: number;
  }[];
}

interface CountRow extends Record<string, unknown> {
  readonly status: string;
  readonly n: number;
}

interface PendingRow extends Record<string, unknown> {
  readonly payRunId: string;
  readonly agentId: string | null;
  readonly purpose: string | null;
  readonly amountAtomic: string | null;
  readonly asset: string | null;
  readonly createdAt: string;
}

interface AgentRow extends Record<string, unknown> {
  readonly agentId: string | null;
  readonly status: string;
  readonly n: number;
  readonly sumAtomic: string;
}

const AUTHORIZED_STATUSES = new Set(["policy_allowed", "approved", "execution_reported"]);

function foldAgents(rows: readonly AgentRow[]): OverviewStats["byAgent"] {
  const map = new Map<string, { agentId: string; authorized: bigint; allowed: number; needsReview: number; blocked: number; executed: number }>();
  for (const row of rows) {
    const id = row.agentId ?? "";
    const acc = map.get(id) ?? { agentId: id, authorized: 0n, allowed: 0, needsReview: 0, blocked: 0, executed: 0 };
    if (AUTHORIZED_STATUSES.has(row.status)) acc.authorized += BigInt(row.sumAtomic || "0");
    switch (row.status) {
      case "policy_allowed": acc.allowed += row.n; break;
      case "pending_review": acc.needsReview += row.n; break;
      case "blocked":
      case "denied": acc.blocked += row.n; break;
      case "execution_reported": acc.executed += row.n; break;
      default: break;
    }
    map.set(id, acc);
  }
  return [...map.values()]
    .sort((a, b) => (b.authorized > a.authorized ? 1 : b.authorized < a.authorized ? -1 : 0))
    .map((a) => ({ agentId: a.agentId, authorizedAtomic: a.authorized.toString(), allowed: a.allowed, needsReview: a.needsReview, blocked: a.blocked, executed: a.executed }));
}

function foldBuckets(rows: readonly CountRow[]): OverviewStats["today"] {
  const today = { allowed: 0, needsReview: 0, blocked: 0, executed: 0 };
  for (const row of rows) {
    switch (row.status) {
      case "policy_allowed": today.allowed += row.n; break;
      case "pending_review": today.needsReview += row.n; break;
      case "blocked":
      case "denied": today.blocked += row.n; break;
      case "execution_reported": today.executed += row.n; break;
      default: break; // other statuses are not surfaced on the Overview
    }
  }
  return today;
}

export async function getOverviewStats(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<OverviewStats> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: workspace.projectId },
    async (client) => {
      const counts = await client.query<CountRow>(
        `SELECT status, COUNT(*)::int AS n
           FROM public.pay_runs
          WHERE project_id = $1::uuid
            AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
          GROUP BY status`,
        [workspace.projectId],
      );
      const pending = await client.query<PendingRow>(
        `SELECT id AS "payRunId",
                document->'intent'->>'agentId' AS "agentId",
                document->'intent'->>'purpose' AS "purpose",
                document->'intent'->'quotedAmount'->>'amountAtomic' AS "amountAtomic",
                document->'intent'->'quotedAmount'->>'asset' AS "asset",
                COALESCE(document->'intent'->>'createdAt', created_at::text) AS "createdAt"
           FROM public.pay_runs
          WHERE project_id = $1::uuid
            AND status = 'pending_review'
          ORDER BY created_at DESC
          LIMIT 10`,
        [workspace.projectId],
      );
      const agents = await client.query<AgentRow>(
        `SELECT document->'intent'->>'agentId' AS "agentId",
                status,
                COUNT(*)::int AS n,
                COALESCE(SUM((document->'intent'->'quotedAmount'->>'amountAtomic')::numeric), 0)::text AS "sumAtomic"
           FROM public.pay_runs
          WHERE project_id = $1::uuid
            AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
          GROUP BY 1, status`,
        [workspace.projectId],
      );
      return {
        today: foldBuckets(counts.rows),
        byAgent: foldAgents(agents.rows),
        pendingReview: pending.rows.map((row) => ({
          payRunId: row.payRunId,
          agentId: row.agentId ?? "",
          purpose: row.purpose ?? "",
          amountAtomic: row.amountAtomic ?? "0",
          asset: row.asset ?? "",
          createdAt: row.createdAt,
        })),
      };
    },
  );
}
