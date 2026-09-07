import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import {
  DEFAULT_POLICY_RULES,
  getWorkspacePolicy,
  saveWorkspacePolicy,
} from "@/features/payrun/hosted/workspace-policy";
import {
  parsePolicyForm,
  renderPolicyForm,
  valuesFromForm,
  valuesFromRules,
  type PolicyFormValues,
} from "@/features/payrun/hosted/policy-form";
import { hostedPage } from "@/features/payrun/hosted/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" };
const LEAD =
  "These rules run on every Pay Run. Real payment intents are checked against them before anything is allowed.";

function renderPage(
  values: PolicyFormValues,
  notice: { readonly text: string; readonly variant: "ok" | "warn" } | null,
): string {
  return hostedPage({
    title: "ZenFix — Policy",
    heading: "Policy",
    active: "policy",
    lead: LEAD,
    notice: notice?.text ?? null,
    noticeVariant: notice?.variant,
    bodyHtml: renderPolicyForm(values),
  });
}

function signInRedirectOr503(): Response {
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
  }
  return Response.redirect(new URL("/zenfix/sign-in", appOrigin), 303);
}

function unavailable(error: unknown): Response | never {
  if (error instanceof AuthenticationRequiredError) return signInRedirectOr503();
  if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
    return new Response("ZenFix Hosted Sandbox is temporarily unavailable.", { status: 503 });
  }
  throw error;
}

export async function GET(request: Request) {
  try {
    const view = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return getWorkspacePolicy(getHostedSqlPool(), identity);
    });
    const saved = new URL(request.url).searchParams.get("status") === "saved";
    const notice = saved ? { text: "Policy saved.", variant: "ok" as const } : null;
    return new Response(renderPage(valuesFromRules(view.rules), notice), { status: 200, headers: HTML_HEADERS });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = parsePolicyForm(form, DEFAULT_POLICY_RULES);
  if (!parsed.ok) {
    const body = renderPage(valuesFromForm(form), { text: parsed.error, variant: "warn" });
    return new Response(body, { status: 400, headers: HTML_HEADERS });
  }
  try {
    await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return saveWorkspacePolicy(getHostedSqlPool(), identity, parsed.rules);
    });
    const appOrigin = readZenFixAppOrigin();
    return Response.redirect(new URL("/zenfix/policy?status=saved", appOrigin), 303);
  } catch (error) {
    return unavailable(error);
  }
}
