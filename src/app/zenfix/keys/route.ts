import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
  type ApiKeyView,
} from "@/features/payrun/hosted/api-keys";
import { renderKeysBody } from "@/features/payrun/hosted/api-keys-view";
import { hostedPage } from "@/features/payrun/hosted/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" };
const LEAD =
  "Bearer keys let your agents call the ZenFix intake API. Only a hash is stored — the full key is shown once.";
const NOTICES: Record<string, string> = { revoked: "API key revoked." };

function renderPage(
  keys: readonly ApiKeyView[],
  notice: string | null,
  newKey?: string,
): string {
  return hostedPage({
    title: "ZenFix — API Keys",
    heading: "API Keys",
    active: "keys",
    lead: LEAD,
    notice,
    bodyHtml: renderKeysBody(keys, newKey),
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
    const keys = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return listWorkspaceApiKeys(getHostedSqlPool(), identity);
    });
    const status = new URL(request.url).searchParams.get("status");
    return new Response(renderPage(keys, status ? NOTICES[status] ?? null : null), {
      status: 200,
      headers: HTML_HEADERS,
    });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const action = form.get("action");
  try {
    if (action === "create") {
      const label = String(form.get("label") ?? "");
      const result = await retryOnTransientUnavailable(async () => {
        const supabase = createSupabaseServerClient();
        const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
        const created = await createWorkspaceApiKey(getHostedSqlPool(), identity, label);
        const keys = await listWorkspaceApiKeys(getHostedSqlPool(), identity);
        return { newKey: created.key, keys };
      });
      return new Response(renderPage(result.keys, "API key created — copy it now.", result.newKey), {
        status: 201,
        headers: HTML_HEADERS,
      });
    }
    if (action === "revoke") {
      const keyId = String(form.get("keyId") ?? "");
      await retryOnTransientUnavailable(async () => {
        const supabase = createSupabaseServerClient();
        const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
        return revokeWorkspaceApiKey(getHostedSqlPool(), identity, keyId);
      });
      return Response.redirect(new URL("/zenfix/keys?status=revoked", readZenFixAppOrigin()), 303);
    }
    return new Response("Unsupported action.", { status: 400 });
  } catch (error) {
    return unavailable(error);
  }
}
