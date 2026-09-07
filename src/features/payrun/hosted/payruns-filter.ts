import type { HostedPayRunSummary } from "./workspace-payruns";
import { escapeHtml } from "./ui";

// Pay Runs list filtering + search. Kept out of the route so it stays small.
// `state` filters by decision category (mapped from PayRunStatus); `q` is a
// case-insensitive contains over agent id, purpose, and Pay Run id. Uses `state`
// / `q` params so it never collides with the create-notice `status` param.

export type StateFilter = "all" | "allowed" | "needs_review" | "blocked" | "executed";

const STATE_LABELS: Record<StateFilter, string> = {
  all: "All",
  allowed: "Allowed",
  needs_review: "Needs review",
  blocked: "Blocked",
  executed: "Executed",
};

// Which PayRunStatus values each filter category matches.
const STATE_STATUSES: Record<Exclude<StateFilter, "all">, readonly string[]> = {
  allowed: ["policy_allowed"],
  needs_review: ["pending_review"],
  blocked: ["blocked", "denied"],
  executed: ["execution_reported"],
};

export interface PayRunFilter {
  readonly state: StateFilter;
  readonly q: string;
}

export function parsePayRunFilter(params: URLSearchParams): PayRunFilter {
  const raw = params.get("state") ?? "all";
  const state: StateFilter = raw in STATE_LABELS ? (raw as StateFilter) : "all";
  return { state, q: (params.get("q") ?? "").trim() };
}

export function applyPayRunFilter(
  runs: readonly HostedPayRunSummary[],
  filter: PayRunFilter,
): HostedPayRunSummary[] {
  const q = filter.q.toLowerCase();
  const statuses = filter.state === "all" ? null : STATE_STATUSES[filter.state];
  return runs.filter((run) => {
    if (statuses && !statuses.includes(run.status)) return false;
    if (!q) return true;
    return (
      run.agentId.toLowerCase().includes(q) ||
      run.purpose.toLowerCase().includes(q) ||
      run.payRunId.toLowerCase().includes(q)
    );
  });
}

export function renderFilterBar(filter: PayRunFilter, total: number, shown: number): string {
  const options = (Object.keys(STATE_LABELS) as StateFilter[])
    .map((s) => `<option value="${s}"${s === filter.state ? " selected" : ""}>${escapeHtml(STATE_LABELS[s])}</option>`)
    .join("");
  const active = filter.state !== "all" || filter.q !== "";
  const count = active
    ? `<span class="hint">${shown} of ${total}</span><a class="link" href="/zenfix/payruns">Clear</a>`
    : `<span class="hint">${total} total</span>`;
  return `<div class="card"><h2>Filter</h2><form class="row" method="get" action="/zenfix/payruns"><label for="state">Status</label><select id="state" name="state">${options}</select><input type="text" name="q" value="${escapeHtml(filter.q)}" placeholder="Search agent, purpose, or ID"><button type="submit" class="btn">Filter</button>${count}</form></div>`;
}
