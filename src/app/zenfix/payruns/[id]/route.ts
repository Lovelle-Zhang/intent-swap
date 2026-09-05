import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import { getWorkspacePayRun, type HostedPayRunDetail } from "@/features/payrun/hosted/workspace-payruns";
import { escapeHtml, hostedPage, statusBadge } from "@/features/payrun/hosted/ui";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Variant = "ok" | "hold" | "blocked" | "neutral";
function variantOf(value: string): Variant {
  const v = value.toLowerCase();
  if (["allowed", "completed", "verified", "succeeded", "balanced", "positive", "approved", "prepared", "posted", "satisfied", "pass", "passed"].includes(v)) return "ok";
  if (["needs_review", "pending", "pending_review", "review", "review_required", "held", "unverified", "requested"].includes(v)) return "hold";
  if (["blocked", "failed", "denied", "declined", "cancelled", "canceled", "rejected", "negative", "stopped", "violated", "unsatisfied"].includes(v)) return "blocked";
  return "neutral";
}
function humanize(value: string): string {
  return value.replace(/_/g, " ");
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function stage(label: string, value: string | null | undefined): string {
  return `<div class="stage"><div class="lab">${label}</div><div class="val">${value ? escapeHtml(humanize(value)) : "—"}</div></div>`;
}

function renderDetail(detail: HostedPayRunDetail): string {
  const pr = detail.payRun;
  const decision = pr.policyDecisions.at(-1) ?? null;
  const amount = formatAtomicMoney(pr.intent.quotedAmount);
  const intentCard = `<div class="card"><h2>Intent</h2><dl><dt>Agent</dt><dd><code>${escapeHtml(pr.intent.agentId)}</code></dd><dt>Purpose</dt><dd>${escapeHtml(pr.intent.purpose)}</dd><dt>Amount</dt><dd><code>${escapeHtml(amount)}</code></dd><dt>Created</dt><dd class="mono">${escapeHtml(fmtTime(pr.intent.createdAt))}</dd></dl></div>`;
  const policyCard = decision
    ? `<div class="card"><h2>Policy decision</h2><div class="detail-head">${statusBadge(humanize(decision.outcome), variantOf(decision.outcome))}<span class="meta"><span>Risk <b>${escapeHtml(decision.riskLevel)}</b></span><span>Next <b>${escapeHtml(humanize(decision.nextAction))}</b></span></span></div>${decision.reasonCodes.length ? `<div class="chips">${decision.reasonCodes.map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join("")}</div>` : ""}${decision.checks.length ? `<ul class="checklist">${decision.checks.map((c) => `<li><span class="mk ${variantOf(c.outcome)}"></span><div><span class="rc">${escapeHtml(humanize(c.ruleClass))} · ${escapeHtml(c.reasonCode)}</span><p>${escapeHtml(c.explanation)}</p></div></li>`).join("")}</ul>` : ""}</div>`
    : "";
  const ledger = pr.ledgerJournal ? "balanced" : pr.ledgerDraft ? "drafted" : null;
  const stagesCard = `<div class="card"><h2>Execution</h2><div class="stages">${stage("Funding", pr.fundingPreparation?.status)}${stage("Payment", pr.paymentExecution?.status)}${stage("Proof", pr.executionProof?.verificationStatus)}${stage("Ledger", ledger)}</div></div>`;
  const trail = detail.auditEvents.length
    ? `<div class="card"><h2>Audit trail</h2><ol class="trail">${detail.auditEvents.map((e) => `<li><time>${escapeHtml(fmtTime(e.occurredAt))}</time><div class="act">${escapeHtml(humanize(e.actionCode))}<small>${escapeHtml(e.reasonCode)}</small></div></li>`).join("")}</ol></div>`
    : "";
  return hostedPage({
    title: `ZenFix — Pay Run ${pr.id}`,
    heading: "Pay Run",
    active: "payruns",
    workspace: { name: detail.workspace.name, projectId: detail.workspace.projectId },
    bodyHtml: `<div class="detail-head"><code>${escapeHtml(pr.id)}</code>${statusBadge(humanize(pr.status), variantOf(pr.status))}</div>${intentCard}${policyCard}${stagesCard}${trail}`,
    actionsHtml: `<div class="actions"><a class="link" href="/zenfix/payruns">← All Pay Runs</a></div>`,
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const detail = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return getWorkspacePayRun(getHostedSqlPool(), identity, params.id);
    });
    const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" };
    if (!detail) {
      const notFound = hostedPage({
        title: "ZenFix — Pay Run not found",
        heading: "Pay Run not found",
        active: "payruns",
        lead: "No Pay Run with that ID exists in your workspace.",
        actionsHtml: `<div class="actions"><a class="link" href="/zenfix/payruns">← All Pay Runs</a></div>`,
      });
      return new Response(notFound, { status: 404, headers });
    }
    return new Response(renderDetail(detail), { status: 200, headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      let appOrigin: string;
      try { appOrigin = readZenFixAppOrigin(); } catch {
        return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
      }
      return Response.redirect(new URL("/zenfix/sign-in", appOrigin), 303);
    }
    if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
      return new Response("ZenFix Hosted Sandbox is temporarily unavailable.", { status: 503 });
    }
    throw error;
  }
}
