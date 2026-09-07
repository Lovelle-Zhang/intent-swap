import type { PayRun } from "../domain/types";
import { escapeHtml, statusBadge } from "./ui";

// Server-rendered review UI for the Pay Run detail surface, kept out of the
// route so that file stays small. Owners see approve/deny actions while a run is
// pending_review, and a "reviewed" line once a human decision is recorded.

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// Maps the ?status= query notice into hostedPage's notice + variant.
export function reviewNotice(status: string | null): { notice: string; variant: "ok" | "warn" } | null {
  switch (status) {
    case "approved":
      return { notice: "Pay Run approved — it is now authorized for execution.", variant: "ok" };
    case "denied":
      return { notice: "Pay Run denied — this decision is final.", variant: "warn" };
    case "not_pending":
      return { notice: "This Pay Run is no longer awaiting review.", variant: "warn" };
    default:
      return null;
  }
}

export function renderReview(pr: PayRun): string {
  if (pr.status === "pending_review") {
    const form = (action: string, label: string, cls: string) =>
      `<form class="inline" method="post" action="/zenfix/payruns/${escapeHtml(pr.id)}/review"><input type="hidden" name="action" value="${action}"><button class="btn${cls}" type="submit">${label}</button></form>`;
    return `<div class="card"><h2>Review</h2><p class="lead">This Pay Run needs a workspace owner to approve or deny it before an agent may execute it.</p><div class="row" style="margin-top:16px">${form("approve", "Approve", "")}${form("deny", "Deny", " ghost")}</div></div>`;
  }
  const decision = pr.approval?.decision;
  if (!decision) return "";
  const variant = decision.outcome === "approved" ? "ok" : "blocked";
  return `<div class="card"><h2>Review decision</h2><div class="detail-head">${statusBadge(decision.outcome, variant)}<span class="meta"><span>By <b>${escapeHtml(decision.reviewerId)}</b></span><span>At <b>${escapeHtml(fmtTime(decision.decidedAt))}</b></span></span></div></div>`;
}
