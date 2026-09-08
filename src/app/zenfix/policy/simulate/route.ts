import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import { resolvePersonalWorkspace } from "@/features/payrun/hosted/workspace";
import { evaluateWorkspaceIntent } from "@/features/payrun/hosted/intake-evaluate";
import {
  parseSimulateInput,
  renderSimulateForm,
  renderSimulateResult,
  simulateValues,
} from "@/features/payrun/hosted/policy-simulate";
import { hostedPage } from "@/features/payrun/hosted/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" };

function page(bodyHtml: string, notice?: { text: string; variant: "warn" }): string {
  return hostedPage({
    title: "ZenFix — Policy dry-run",
    heading: "Policy · dry-run",
    active: "policy",
    lead: "Evaluate a hypothetical intent against your current policy — nothing is saved.",
    notice: notice?.text ?? null,
    noticeVariant: notice?.variant,
    bodyHtml,
    actionsHtml: `<div class="actions"><a class="link" href="/zenfix/policy">← Back to Policy</a></div>`,
  });
}

// GET /zenfix/policy/simulate — a pure, non-persisting evaluation of a
// hypothetical intent against the current saved policy (same engine as real
// intake, via evaluateWorkspaceIntent). Read-only, so a GET with the intent in
// the query is safe and shareable; identity still comes only from the session.
export async function GET(request: Request): Promise<Response> {
  const values = simulateValues(new URL(request.url).searchParams);
  const parsed = parseSimulateInput(values);
  if (!parsed.ok) {
    return new Response(page(renderSimulateForm(values), { text: parsed.error, variant: "warn" }), { status: 400, headers: HTML_HEADERS });
  }
  try {
    const decision = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      const pool = getHostedSqlPool();
      const workspace = await resolvePersonalWorkspace(pool, identity);
      const { evaluation } = await evaluateWorkspaceIntent(pool, identity, workspace.projectId, parsed.input, new Date().toISOString());
      return evaluation.decision;
    });
    return new Response(page(renderSimulateForm(values) + renderSimulateResult(values, decision)), { status: 200, headers: HTML_HEADERS });
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
