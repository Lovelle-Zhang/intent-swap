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

// Date range + pagination. Kept separate from PayRunFilter so the status/search
// filter stays a stable unit; `from`/`to` are UTC calendar days (inclusive) and
// `page` is 1-based. Applied in-memory over the already-loaded list, like the
// status/search filter above.
export const PAGE_SIZE = 25;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PayRunPage {
  readonly from: string; // "YYYY-MM-DD" or ""
  readonly to: string; // "YYYY-MM-DD" or ""
  readonly page: number; // 1-based
}

export function parsePayRunPage(params: URLSearchParams): PayRunPage {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const raw = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    from: DATE_RE.test(from) ? from : "",
    to: DATE_RE.test(to) ? to : "",
    page: Number.isFinite(raw) && raw > 0 ? raw : 1,
  };
}

export function applyDateRange(
  runs: readonly HostedPayRunSummary[],
  page: PayRunPage,
): HostedPayRunSummary[] {
  const fromMs = page.from ? Date.parse(`${page.from}T00:00:00.000Z`) : null;
  const toMs = page.to ? Date.parse(`${page.to}T23:59:59.999Z`) : null;
  return runs.filter((run) => {
    const t = Date.parse(run.createdAt);
    if (Number.isNaN(t)) return true; // never drop rows with unparseable timestamps
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return true;
  });
}

export interface Paged<T> {
  readonly rows: readonly T[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export function paginate<T>(rows: readonly T[], page: number, size = PAGE_SIZE): Paged<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const start = (clamped - 1) * size;
  return { rows: rows.slice(start, start + size), page: clamped, pageCount, total };
}

function pageHref(filter: PayRunFilter, page: PayRunPage, n: number): string {
  const p = new URLSearchParams();
  if (filter.state !== "all") p.set("state", filter.state);
  if (filter.q) p.set("q", filter.q);
  if (page.from) p.set("from", page.from);
  if (page.to) p.set("to", page.to);
  if (n > 1) p.set("page", String(n));
  const qs = p.toString();
  return qs ? `/zenfix/payruns?${qs}` : "/zenfix/payruns";
}

export function renderPager(paged: Paged<unknown>, filter: PayRunFilter, page: PayRunPage): string {
  if (paged.pageCount <= 1) return "";
  const prev = paged.page > 1
    ? `<a class="link" href="${escapeHtml(pageHref(filter, page, paged.page - 1))}">← Prev</a>`
    : `<span class="hint">← Prev</span>`;
  const next = paged.page < paged.pageCount
    ? `<a class="link" href="${escapeHtml(pageHref(filter, page, paged.page + 1))}">Next →</a>`
    : `<span class="hint">Next →</span>`;
  return `<div class="row" style="margin-top:14px">${prev}<span class="hint">Page ${paged.page} of ${paged.pageCount}</span>${next}</div>`;
}

export function renderFilterBar(filter: PayRunFilter, total: number, shown: number, page?: PayRunPage): string {
  const options = (Object.keys(STATE_LABELS) as StateFilter[])
    .map((s) => `<option value="${s}"${s === filter.state ? " selected" : ""}>${escapeHtml(STATE_LABELS[s])}</option>`)
    .join("");
  const dateActive = !!(page && (page.from || page.to));
  const active = filter.state !== "all" || filter.q !== "" || dateActive;
  const count = active
    ? `<span class="hint">${shown} of ${total}</span><a class="link" href="/zenfix/payruns">Clear</a>`
    : `<span class="hint">${total} total</span>`;
  const dates = page
    ? `<span class="daterange"><label for="from">From</label><input type="date" id="from" name="from" value="${escapeHtml(page.from)}"><label for="to">To</label><input type="date" id="to" name="to" value="${escapeHtml(page.to)}"></span>`
    : "";
  return `<div class="card"><h2>Filter</h2><form class="row" method="get" action="/zenfix/payruns"><label for="state">Status</label><select id="state" name="state">${options}</select><input type="text" name="q" value="${escapeHtml(filter.q)}" placeholder="Search agent, purpose, or ID">${dates}<button type="submit" class="btn">Filter</button>${count}</form></div>`;
}
