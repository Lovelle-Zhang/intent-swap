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
  valuesFromForm,
  valuesFromRules,
  type PolicyFormValues,
} from "@/features/payrun/hosted/policy-form";
import { renderPolicyForm } from "@/features/payrun/hosted/policy-form-view";
import {
  agentLimitValuesFromForm,
  agentLimitValuesFromLimits,
  parseAgentLimits,
  renderAgentLimitFields,
  type AgentLimitFormValues,
} from "@/features/payrun/hosted/policy-agent-limits";
import { parseWebhookUrl, renderWebhookField } from "@/features/payrun/hosted/webhook";
import {
  merchantAddressesToText,
  parseMerchantAddresses,
  renderMerchantAddressField,
} from "@/features/payrun/hosted/merchant-registry";
import { renderSimulateForm } from "@/features/payrun/hosted/policy-simulate";
import { hostedPage } from "@/features/payrun/hosted/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTML_HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" };
const LEAD =
  "These rules run on every Pay Run. Real payment intents are checked against them before anything is allowed.";

// Save is a POST → 303 → GET reload, which resets scroll to the top and bounces
// the owner away from where they were editing (the form is long). Restore their
// scroll across that reload, and confirm the save with a fixed toast that shows
// regardless of scroll position (rather than only a top banner they can't see).
const SAVED_TOAST = `<div class="savedtoast" role="status">✓ Policy saved</div>`;
const POLICY_SCROLL_SCRIPT = `<script>(function(){try{var K="zenfix_policy_scrollY";if(new URLSearchParams(location.search).get("status")==="saved"){var y=sessionStorage.getItem(K);if(y!==null){window.scrollTo(0,parseInt(y,10)||0);sessionStorage.removeItem(K);}}var f=document.querySelector('form[action="/zenfix/policy"][method="post"]');if(f){f.addEventListener("submit",function(){try{sessionStorage.setItem(K,String(window.scrollY));}catch(e){}});}}catch(e){}})();</script>`;

function renderPage(
  values: PolicyFormValues,
  agentLimits: AgentLimitFormValues,
  webhookUrl: string,
  emailEnabled: boolean,
  merchantAddresses: string,
  opts: { readonly saved?: boolean; readonly error?: string },
): string {
  return hostedPage({
    title: "ZenFix — Policy",
    heading: "Policy",
    active: "policy",
    lead: LEAD,
    notice: opts.error ?? null,
    noticeVariant: opts.error ? "warn" : undefined,
    bodyHtml: renderPolicyForm(
      values,
      renderMerchantAddressField(merchantAddresses) + renderAgentLimitFields(agentLimits) + renderWebhookField(webhookUrl || null, emailEnabled),
    ) + renderSimulateForm() + (opts.saved ? SAVED_TOAST : "") + POLICY_SCROLL_SCRIPT,
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
    return new Response(
      renderPage(
        valuesFromRules(view.rules, view.dailyBudgetAtomic, view.agentBudgets),
        agentLimitValuesFromLimits(view.agentLimits),
        view.notifyWebhookUrl ?? "",
        view.notifyEmailEnabled,
        merchantAddressesToText(view.merchantAddresses),
        { saved },
      ),
      { status: 200, headers: HTML_HEADERS },
    );
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  const form = await request.formData();
  const agentLimitValues = agentLimitValuesFromForm(form);
  const webhookRaw = String(form.get("notifyWebhookUrl") ?? "");
  const emailEnabled = form.get("notifyEmailEnabled") !== null; // unchecked box = absent
  const merchantRaw = String(form.get("merchantAddresses") ?? "");
  const parsed = parsePolicyForm(form, DEFAULT_POLICY_RULES);
  const agentLimits = parseAgentLimits(agentLimitValues);
  const webhook = parseWebhookUrl(webhookRaw);
  const merchants = parseMerchantAddresses(merchantRaw);
  const invalid = (message: string) =>
    new Response(
      renderPage(valuesFromForm(form), agentLimitValues, webhookRaw, emailEnabled, merchantRaw, { error: message }),
      { status: 400, headers: HTML_HEADERS },
    );
  if (!parsed.ok) return invalid(parsed.error);
  if (!agentLimits.ok) return invalid(agentLimits.error);
  if (!webhook.ok) return invalid(webhook.error);
  if (!merchants.ok) return invalid(merchants.error);
  try {
    await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return saveWorkspacePolicy(
        getHostedSqlPool(), identity, parsed.rules, parsed.dailyBudgetAtomic, parsed.agentBudgets, agentLimits.limits, webhook.url, merchants.addresses, emailEnabled,
      );
    });
    const appOrigin = readZenFixAppOrigin();
    return Response.redirect(new URL("/zenfix/policy?status=saved", appOrigin), 303);
  } catch (error) {
    return unavailable(error);
  }
}
