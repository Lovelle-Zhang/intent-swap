import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { resolvePersonalWorkspace } from "@/features/payrun/hosted/workspace";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function GET(request: Request) {
  try {
    const workspace = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return resolvePersonalWorkspace(getHostedSqlPool(), identity);
    });
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ZenFix Personal Workspace</title></head><body style="margin:0;background:#0c0c0d;color:#f5f5f4;font-family:system-ui"><main style="max-width:680px;margin:0 auto;padding:10vh 24px"><p style="color:#67e8f9">ZenFix Hosted Sandbox</p><h1>${escape(workspace.name)}</h1><p>Your persistent Personal Workspace is ready.</p><dl><dt>Workspace ID</dt><dd><code>${escape(workspace.projectId)}</code></dd><dt>Mode</dt><dd>${escape(workspace.mode)}</dd></dl><p><a href="/zenfix/payruns">View your Pay Runs →</a></p><form action="/zenfix/sign-out" method="post"><button type="submit">Sign out</button></form></main></body></html>`;
    return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      let appOrigin: string;
      try { appOrigin = readZenFixAppOrigin(); } catch {
        return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
      }
      return Response.redirect(new URL("/zenfix/sign-in", appOrigin), 303);
    }
    // TEMP DIAGNOSTIC (revert): surface the real error class + cause so the
    // intermittent 503 can be pinpointed without dashboard log access.
    const e = error as { name?: string; message?: string; code?: string; cause?: unknown };
    const cause = e?.cause;
    const causeDetail = cause instanceof Error ? `${cause.name}: ${cause.message}` : cause != null ? String(cause) : "";
    const detail = `${e?.name ?? typeof error}${e?.code ? `(${e.code})` : ""}: ${e?.message ?? ""}${causeDetail ? ` <= ${causeDetail}` : ""}`;
    console.error("[zenfix-diag] workspace 503", detail);
    return new Response(`ZenFix Hosted Sandbox is temporarily unavailable. [diag] ${detail}`, { status: 503 });
  }
}
