import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { SANDBOX_SCENARIO_IDS } from "@/features/payrun/application/control-loop-commands";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import {
  listWorkspacePayRuns,
  type HostedPayRunSummary,
  type HostedWorkspacePayRunsView,
} from "@/features/payrun/hosted/workspace-payruns";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";
import { escapeHtml, hostedPage, statusBadge } from "@/features/payrun/hosted/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOTICES: Record<string, string> = {
  payrun_created: "Sandbox Pay Run created.",
  invalid_scenario: "That scenario is not recognized.",
};

function statusVariant(value: string): "ok" | "blocked" | "neutral" {
  const v = value.toLowerCase();
  if (["completed", "succeeded", "executed", "settled", "paid", "allowed", "approved"].includes(v)) return "ok";
  if (["failed", "blocked", "declined", "denied", "cancelled", "canceled", "rejected"].includes(v)) return "blocked";
  return "neutral";
}

function renderRow(payRun: HostedPayRunSummary): string {
  const amount = formatAtomicMoney(payRun.amount);
  const policyCell = payRun.policy
    ? statusBadge(payRun.policy.outcome, statusVariant(payRun.policy.outcome))
    : "—";
  return `<tr><td><code>${escapeHtml(payRun.payRunId)}</code></td><td>${statusBadge(payRun.status, statusVariant(payRun.status))}</td><td>${escapeHtml(payRun.purpose)}</td><td><code>${escapeHtml(payRun.agentId)}</code></td><td>${escapeHtml(amount)}</td><td>${policyCell}</td></tr>`;
}

function renderHtml(view: HostedWorkspacePayRunsView, notice: string | null): string {
  const options = SANDBOX_SCENARIO_IDS.map((id) => `<option value="${id}">${escapeHtml(id)}</option>`).join("");
  const rows = view.payRuns.length === 0
    ? `<tr><td colspan="6" class="empty">No Pay Runs yet — create one above.</td></tr>`
    : view.payRuns.map(renderRow).join("");
  const form = `<div class="card"><h2>Create a sandbox Pay Run</h2><form class="row" action="/zenfix/payruns/create" method="post"><label for="scenarioId">Scenario</label><select id="scenarioId" name="scenarioId">${options}</select><button type="submit" class="btn">Create Pay Run</button></form></div>`;
  const table = `<div class="tablewrap"><table><thead><tr><th>Pay Run</th><th>Status</th><th>Purpose</th><th>Agent</th><th>Amount</th><th>Policy</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return hostedPage({
    title: "ZenFix Pay Runs",
    heading: "Pay Runs",
    workspace: { name: view.workspace.name, projectId: view.workspace.projectId },
    notice,
    bodyHtml: form + table,
    actionsHtml: `<div class="actions"><a class="link" href="/zenfix/workspace">← Workspace</a></div>`,
  });
}

export async function GET(request: Request) {
  try {
    const view = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return listWorkspacePayRuns(getHostedSqlPool(), identity);
    });
    const status = new URL(request.url).searchParams.get("status") ?? new URL(request.url).searchParams.get("error");
    const notice = status ? (NOTICES[status] ?? null) : null;
    return new Response(renderHtml(view, notice), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
    });
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
