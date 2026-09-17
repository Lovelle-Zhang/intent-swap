// Minimal best-effort transactional email via Resend — the same provider and
// from-address the health-check cron already uses. Sending is advisory: it never
// throws and never blocks the request that triggered it (short timeout, no
// retries). With no RESEND_API_KEY configured it is a silent no-op, so local and
// preview environments simply don't send.

const SEND_TIMEOUT_MS = 4000;

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

function apiKey(): string {
  return process.env.RESEND_API_KEY ?? "";
}

// A dedicated receipts identity if configured, else the shared alerts sender.
function fromAddress(): string {
  return process.env.ZENFIX_EMAIL_FROM
    ?? process.env.RESEND_FROM
    ?? "ZenFix <alerts@intent-swap.app>";
}

// Resolves whether or not delivery worked; a failed send never affects the
// caller. Returns true only when Resend accepted the message (2xx).
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const key = apiKey();
  if (!key) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
