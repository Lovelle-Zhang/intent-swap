import { escapeHtml } from "./ui";

// Optional per-workspace needs_review notification webhook. It is an advisory
// nudge only (no secret / no signature) — the receiver authenticates the truth
// by calling GET /api/v1/payruns/{id} with its own key. Delivery is best-effort,
// non-blocking-ish (short timeout, no retries). The URL is validated both when
// saved and again at send time to keep the SSRF surface small.

const SEND_TIMEOUT_MS = 3000;

// Block obviously-internal targets: our server makes this request, so a
// user-supplied URL must not point at localhost / private / link-local space.
// Best-effort literal-host check (https-only, no credentials); not a substitute
// for network egress controls, but closes the easy SSRF holes.
function isSafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "[::1]" || h === "::1") return false;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return false; // IPv6 ULA / link-local
  return h.length > 0;
}

export function isSafeWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  return isSafeHost(url.hostname);
}

export type WebhookParse =
  | { readonly ok: true; readonly url: string | null }
  | { readonly ok: false; readonly error: string };

// Empty = disabled (null). Otherwise it must be a safe https URL.
export function parseWebhookUrl(raw: string): WebhookParse {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, url: null };
  if (!isSafeWebhookUrl(trimmed)) {
    return { ok: false, error: "The notification webhook must be an https:// URL to a public host." };
  }
  return { ok: true, url: trimmed };
}

export function renderWebhookField(value: string | null): string {
  const v = value ?? "";
  return `<div class="card"><h2>Notifications</h2>
    <div class="field"><label for="notifyWebhookUrl">Needs-review webhook</label>
    <input type="text" id="notifyWebhookUrl" name="notifyWebhookUrl" placeholder="https://your-app.example.com/zenfix/hook" value="${escapeHtml(v)}">
    <span class="hint">Optional. When a Pay Run needs review, ZenFix POSTs an advisory nudge here (no secret) — your receiver confirms via <code>GET /api/v1/payruns/{id}</code>. Leave empty to disable.</span></div>
  </div>`;
}

export interface NeedsReviewPayload {
  readonly event: "payrun.needs_review";
  readonly payRunId: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly amount: { readonly amountAtomic: string; readonly asset: string };
  readonly createdAt: string;
}

// Fire-and-verify-safe: never throws, resolves whether or not delivery worked.
// Re-checks the URL at send time (config may predate a stricter guard).
export async function sendNeedsReviewWebhook(url: string | null, payload: NeedsReviewPayload): Promise<void> {
  if (!url || !isSafeWebhookUrl(url)) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "ZenFix-PayRun/1.0" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    // best-effort: a failed nudge never affects the decision or the response.
  } finally {
    clearTimeout(timer);
  }
}
