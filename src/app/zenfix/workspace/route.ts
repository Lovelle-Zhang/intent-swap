import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { CommitOutcomeUnknownError, UnsafeDatabaseRoleError } from "@/features/payrun/adapters/storage/errors";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { resolvePersonalWorkspace } from "@/features/payrun/hosted/workspace";
import { getBudgetState } from "@/features/payrun/hosted/workspace-budget";
import { getOverviewStats } from "@/features/payrun/hosted/workspace-overview";
import { renderOverviewDashboard } from "@/features/payrun/hosted/workspace-overview-view";
import { getOnboardingState } from "@/features/payrun/hosted/onboarding";
import { renderOnboarding } from "@/features/payrun/hosted/onboarding-view";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import { escapeHtml, hostedPage } from "@/features/payrun/hosted/ui";

// Next always invokes this with the Request; the Overview intentionally reads
// nothing from it (workspace authorization must not depend on request inputs).
export async function GET(_request: Request) {
  try {
    const { workspace, budget, stats, onboarding } = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      const pool = getHostedSqlPool();
      return {
        workspace: await resolvePersonalWorkspace(pool, identity),
        budget: await getBudgetState(pool, identity),
        stats: await getOverviewStats(pool, identity),
        onboarding: await getOnboardingState(pool, identity),
      };
    });
    const body = hostedPage({
      title: "ZenFix — Overview",
      heading: "Overview",
      active: "overview",
      lead: "Your agent payment control layer, in sandbox. Create Pay Runs and inspect how each one is decided.",
      bodyHtml: `${renderOnboarding(onboarding)}<div class="card"><h2>Personal workspace</h2><dl><dt>Workspace ID</dt><dd><code>${escapeHtml(workspace.projectId)}</code></dd><dt>Mode</dt><dd>${escapeHtml(workspace.mode)}</dd></dl></div>${renderOverviewDashboard(stats, budget)}`,
      actionsHtml: `<div class="actions"><a class="btn" href="/zenfix/payruns">Open Pay Runs →</a></div>`,
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
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
    if (error instanceof CommitOutcomeUnknownError || error instanceof UnsafeDatabaseRoleError) throw error;
    throw error;
  }
}
