import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { CommitOutcomeUnknownError, UnsafeDatabaseRoleError } from "@/features/payrun/adapters/storage/errors";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { resolvePersonalWorkspace } from "@/features/payrun/hosted/workspace";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import { escapeHtml, hostedPage } from "@/features/payrun/hosted/ui";

export async function GET(request: Request) {
  try {
    const workspace = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return resolvePersonalWorkspace(getHostedSqlPool(), identity);
    });
    const body = hostedPage({
      title: "ZenFix Personal Workspace",
      heading: workspace.name,
      lead: "Your persistent Personal Workspace is ready.",
      bodyHtml: `<div class="card"><h2>Workspace</h2><dl><dt>Workspace ID</dt><dd><code>${escapeHtml(workspace.projectId)}</code></dd><dt>Mode</dt><dd>${escapeHtml(workspace.mode)}</dd></dl></div>`,
      actionsHtml: `<div class="actions"><a class="link" href="/zenfix/payruns">View your Pay Runs →</a><form action="/zenfix/sign-out" method="post" style="margin:0"><button type="submit" class="btn ghost">Sign out</button></form></div>`,
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
