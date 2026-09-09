import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import { atomicToUsdc } from "./policy-form";
import { escapeHtml } from "./ui";
import { resolvePersonalWorkspace, type VerifiedAuthIdentity } from "./workspace";

// Spend over time for the Overview — authorized USDC per UTC day for the last N
// days. DERIVED from pay_runs (sum of quoted amounts of AUTHORIZED runs — status
// policy_allowed | approved | execution_reported — the same set the budget uses),
// no ledger table. Only days with authorized spend are returned, newest first.

const AUTHORIZED = ["policy_allowed", "approved", "execution_reported"];

export interface SpendDay {
  readonly day: string; // "YYYY-MM-DD" (UTC)
  readonly authorizedAtomic: string;
  readonly count: number;
}

interface DayRow extends Record<string, unknown> {
  readonly day: string;
  readonly sumAtomic: string;
  readonly n: number;
}

export async function getSpendHistory(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  days = 7,
): Promise<SpendDay[]> {
  const workspace = await resolvePersonalWorkspace(pool, identity);
  return withHostedTransaction(
    { pool, userId: identity.userId, requireProjectId: workspace.projectId },
    async (client) => {
      const res = await client.query<DayRow>(
        `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'utc'), 'YYYY-MM-DD') AS day,
                COALESCE(SUM((document->'intent'->'quotedAmount'->>'amountAtomic')::numeric), 0)::text AS "sumAtomic",
                COUNT(*)::int AS n
           FROM public.pay_runs
          WHERE project_id = $1::uuid
            AND status = ANY($2::text[])
            AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc') - (($3::int - 1) * interval '1 day')
          GROUP BY 1
          ORDER BY 1 DESC`,
        [workspace.projectId, AUTHORIZED, days],
      );
      return res.rows.map((r) => ({ day: r.day, authorizedAtomic: r.sumAtomic, count: r.n }));
    },
  );
}

export function renderSpendHistory(history: readonly SpendDay[], days = 7): string {
  if (history.length === 0) {
    return `<div class="card"><h2>Spend · last ${days} days</h2><div class="empty">No authorized spend in the last ${days} days.</div></div>`;
  }
  const total = history.reduce((sum, d) => sum + BigInt(d.authorizedAtomic), 0n).toString();
  const rows = history
    .map((d) => `<tr><td class="muted">${escapeHtml(d.day)}</td><td class="num">${escapeHtml(atomicToUsdc(d.authorizedAtomic))}</td><td class="num">${d.count}</td></tr>`)
    .join("");
  return `<div class="card"><h2>Spend · last ${days} days</h2><div class="tablewrap"><table><thead><tr><th>Day (UTC)</th><th class="num">Authorized (USDC)</th><th class="num">Runs</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td class="muted">Total</td><td class="num">${escapeHtml(atomicToUsdc(total))}</td><td class="num"></td></tr></tfoot></table></div></div>`;
}
