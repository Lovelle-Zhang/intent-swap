import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { SANDBOX_SCENARIO_IDS } from "@/features/payrun/application/control-loop-commands";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import {
  listWorkspacePayRuns,
  type HostedPayRunSummary,
  type HostedWorkspacePayRunsView,
} from "@/features/payrun/hosted/workspace-payruns";
import { formatAtomicMoney } from "@/features/payrun/presentation/money";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

const NOTICES: Record<string, string> = {
  payrun_created: "Sandbox Pay Run created.",
  invalid_scenario: "That scenario is not recognized.",
};

function renderRow(payRun: HostedPayRunSummary): string {
  const amount = formatAtomicMoney(payRun.amount);
  const policy = payRun.policy ? escape(payRun.policy.outcome) : "—";
  return `<tr><td><code>${escape(payRun.payRunId)}</code></td><td>${escape(payRun.status)}</td><td>${escape(payRun.purpose)}</td><td>${escape(payRun.agentId)}</td><td>${escape(amount)}</td><td>${policy}</td></tr>`;
}

function renderHtml(view: HostedWorkspacePayRunsView, notice: string | null): string {
  const options = SANDBOX_SCENARIO_IDS.map((id) => `<option value="${id}">${id}</option>`).join("");
  const rows = view.payRuns.length === 0
    ? `<tr><td colspan="6">No Pay Runs yet — create one above.</td></tr>`
    : view.payRuns.map(renderRow).join("");
  const banner = notice ? `<p role="status">${escape(notice)}</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ZenFix Pay Runs</title></head><body style="margin:0;background:#0c0c0d;color:#f5f5f4;font-family:system-ui"><main style="max-width:920px;margin:0 auto;padding:6vh 24px"><p style="color:#fbbf24;letter-spacing:.15em">SANDBOX / NO REAL FUNDS</p><p style="color:#67e8f9">${escape(view.workspace.name)} · <code>${escape(view.workspace.projectId)}</code></p><h1>Pay Runs</h1>${banner}<form action="/zenfix/payruns/create" method="post"><label for="scenarioId">Scenario</label> <select id="scenarioId" name="scenarioId">${options}</select> <button type="submit">Create sandbox Pay Run</button></form><table><thead><tr><th>Pay Run</th><th>Status</th><th>Purpose</th><th>Agent</th><th>Amount</th><th>Policy</th></tr></thead><tbody>${rows}</tbody></table><p><a href="/zenfix/workspace">← Workspace</a></p></main></body></html>`;
}

export async function GET(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
    const view = await listWorkspacePayRuns(getHostedSqlPool(), identity);
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
