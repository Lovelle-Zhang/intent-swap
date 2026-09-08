import { atomicToUsdc } from "./policy-form";
import type { BudgetState } from "./workspace-budget";
import type { OverviewStats } from "./workspace-overview";
import { escapeHtml } from "./ui";

// Dumb renderer for the signed-in Overview control plane. Reuses the shared
// ui.ts design system (.card, .stages/.stage, a.link, .empty). No new styles.

function budgetCard(budget: BudgetState): string {
  if (budget.unlimited) {
    return `<div class="card"><h2>Daily budget</h2><dl><dt>Budget</dt><dd>Unlimited</dd></dl></div>`;
  }
  const usdc = (atomic: string) => `${escapeHtml(atomicToUsdc(atomic))} USDC`;
  return `<div class="card"><h2>Daily budget</h2><dl><dt>Budget</dt><dd>${usdc(budget.dailyBudgetAtomic)}</dd><dt>Spent today</dt><dd>${usdc(budget.spentTodayAtomic)}</dd><dt>Remaining</dt><dd>${usdc(budget.remainingAtomic)}</dd></dl></div>`;
}

function tile(label: string, count: number): string {
  return `<div class="stage"><div class="lab">${escapeHtml(label)}</div><div class="val">${count}</div></div>`;
}

function decisionsCard(today: OverviewStats["today"]): string {
  return `<div class="card"><h2>Today's decisions</h2><div class="stages">${
    tile("Allowed", today.allowed)
  }${tile("Needs review", today.needsReview)}${tile("Blocked", today.blocked)}${
    tile("Executed", today.executed)
  }</div></div>`;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function reviewRow(item: OverviewStats["pendingReview"][number]): string {
  const amount = `${escapeHtml(atomicToUsdc(item.amountAtomic))} ${escapeHtml(item.asset || "USDC")}`;
  const href = `/zenfix/payruns/${encodeURIComponent(item.payRunId)}`;
  return `<div class="row"><a class="link" href="${href}"><code>${escapeHtml(item.agentId)}</code></a> <span class="muted">${escapeHtml(item.purpose)}</span> <span class="muted">${amount}</span> <span class="muted">${escapeHtml(formatCreatedAt(item.createdAt))}</span></div>`;
}

function reviewCard(pending: OverviewStats["pendingReview"]): string {
  const body = pending.length === 0
    ? `<div class="empty">Nothing waiting for review.</div>`
    : pending.map(reviewRow).join("");
  return `<div class="card"><h2>Needs your review (${pending.length})</h2>${body}</div>`;
}

function agentRow(a: OverviewStats["byAgent"][number]): string {
  return `<tr><td><code>${escapeHtml(a.agentId || "—")}</code></td><td class="num">${escapeHtml(atomicToUsdc(a.authorizedAtomic))}</td><td class="num">${a.allowed}</td><td class="num">${a.needsReview}</td><td class="num">${a.blocked}</td><td class="num">${a.executed}</td></tr>`;
}

function byAgentCard(byAgent: OverviewStats["byAgent"]): string {
  if (byAgent.length === 0) return "";
  const rows = byAgent.map(agentRow).join("");
  return `<div class="card"><h2>By agent today</h2><div class="tablewrap"><table><thead><tr><th>Agent</th><th class="num">Authorized (USDC)</th><th class="num">Allowed</th><th class="num">Needs review</th><th class="num">Blocked</th><th class="num">Executed</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

export function renderOverviewDashboard(stats: OverviewStats, budget: BudgetState): string {
  return `${budgetCard(budget)}${decisionsCard(stats.today)}${byAgentCard(stats.byAgent)}${reviewCard(stats.pendingReview)}`;
}
