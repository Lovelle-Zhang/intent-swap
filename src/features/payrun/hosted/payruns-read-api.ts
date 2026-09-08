import { PersistenceUnavailableError } from "../adapters/storage";
import type { SqlPool } from "../adapters/storage/postgres/sql";
import type { PayRun } from "../domain/types";
import { resolveApiKeyIdentity } from "./api-keys";
import { AuthUnavailableError } from "./errors";
import { retryOnTransientUnavailable } from "./retry";
import { getWorkspacePayRun, listWorkspacePayRuns, type HostedPayRunSummary } from "./workspace-payruns";

// Read side of the agent HTTP API (bearer `zfk_live_…` key, workspace-scoped):
//   GET /api/v1/payruns          — list the workspace's runs (filter + limit)
//   GET /api/v1/payruns/{id}     — one run's decision, review, and execution
// This closes the needs_review loop: an agent that got `needs_review` on submit
// can poll {id} to learn the human's approve/deny outcome. Read-only.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function bearer(request: Request): string | null {
  const match = /^Bearer (.+)$/.exec((request.headers.get("authorization") ?? "").trim());
  return match ? match[1] : null;
}

function toListItem(s: HostedPayRunSummary) {
  return {
    payRunId: s.payRunId, status: s.status, agentId: s.agentId, purpose: s.purpose,
    createdAt: s.createdAt, amount: s.amount,
    decision: s.policy ? { outcome: s.policy.outcome, reasonCodes: [...s.policy.reasonCodes] } : null,
  };
}

function toDetail(pr: PayRun) {
  const d = pr.policyDecisions.at(-1) ?? null;
  const rep = pr.executionReport;
  const rev = pr.approval?.decision ?? null;
  return {
    payRunId: pr.id, status: pr.status, agentId: pr.intent.agentId, purpose: pr.intent.purpose,
    createdAt: pr.intent.createdAt,
    amount: {
      amountAtomic: pr.intent.quotedAmount.amountAtomic,
      asset: pr.intent.quotedAmount.asset,
      decimals: pr.intent.quotedAmount.decimals,
    },
    decision: d
      ? {
          outcome: d.outcome, reasonCodes: [...d.reasonCodes], riskLevel: d.riskLevel, nextAction: d.nextAction,
          checks: d.checks.map((c) => ({ ruleClass: c.ruleClass, reasonCode: c.reasonCode, outcome: c.outcome, explanation: c.explanation })),
        }
      : null,
    executionReport: rep
      ? { outcome: rep.outcome, providerReference: rep.providerReference, transactionHash: rep.transactionHash ?? null, rail: rep.rail, reportedAt: rep.reportedAt }
      : null,
    review: rev ? { outcome: rev.outcome, decidedAt: rev.decidedAt } : null,
  };
}

function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function unavailable(error: unknown): Response {
  if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
    return json({ error: "ZenFix is temporarily unavailable" }, 503);
  }
  throw error;
}

export async function handleListPayRuns(pool: SqlPool, request: Request): Promise<Response> {
  const identity = await resolveApiKeyIdentity(pool, bearer(request));
  if (!identity) return json({ error: "Unauthorized" }, 401);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const agentId = params.get("agentId");
  const limit = parseLimit(params.get("limit"));
  try {
    const view = await retryOnTransientUnavailable(() => listWorkspacePayRuns(pool, identity));
    // Newest first, then apply the optional status/agent filters and the limit.
    const runs = [...view.payRuns]
      .reverse()
      .filter((r) => (status ? r.status === status : true) && (agentId ? r.agentId === agentId : true))
      .slice(0, limit)
      .map(toListItem);
    return json({ payRuns: runs, count: runs.length }, 200);
  } catch (error) {
    return unavailable(error);
  }
}

export async function handleGetPayRun(pool: SqlPool, request: Request, id: string): Promise<Response> {
  const identity = await resolveApiKeyIdentity(pool, bearer(request));
  if (!identity) return json({ error: "Unauthorized" }, 401);
  try {
    const detail = await retryOnTransientUnavailable(() => getWorkspacePayRun(pool, identity, id));
    if (!detail) return json({ error: "Pay Run not found" }, 404);
    return json(toDetail(detail.payRun), 200);
  } catch (error) {
    return unavailable(error);
  }
}
