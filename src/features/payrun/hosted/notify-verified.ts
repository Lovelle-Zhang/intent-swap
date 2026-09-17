import type { SqlPool } from "../adapters/storage/postgres/sql";
import { readZenFixAppOrigin } from "./config";
import { sendEmail, type EmailMessage } from "./email";
import { resolveOwnerEmail } from "./owner-email";
import { renderVerifiedPaymentEmail } from "./verified-payment-email";
import type { VerifiedAuthIdentity } from "./workspace";
import { getWorkspacePolicy } from "./workspace-policy";

// Owner-facing notification for a Pay Run that just closed VERIFIED on-chain.
// The email is the product thesis in an inbox — see verified-payment-email.ts.
// Firing is advisory: it must never throw and never affect the execution
// response. It sends only when the workspace has email on (opt-out, default true)
// and the owner's address is known.

export interface VerifiedNotification {
  readonly payRunId: string;
  readonly agentId: string;
  readonly purpose: string;
  readonly amountAtomic: string;
  readonly asset: string;
  readonly rail: string;
  readonly transactionHash: string;
  readonly recipient: string | null;
  readonly pinnedMerchant: boolean;
}

export interface VerifiedNotifyDeps {
  readonly isEmailEnabled: () => Promise<boolean>;
  readonly getOwnerEmail: () => Promise<string | null>;
  readonly send: (message: EmailMessage) => Promise<boolean>;
  readonly appOrigin: () => string;
}

function safeAppOrigin(): string {
  try {
    return readZenFixAppOrigin();
  } catch {
    return "https://intent-swap.app";
  }
}

// Pure decision + render, seam-injected so the "when do we send?" logic is
// testable without a database or a live mailer. Returns true only on an accepted
// send. Never throws for a benign "nothing to do" — only genuine dep faults.
export async function deliverVerifiedPayment(
  input: VerifiedNotification,
  deps: VerifiedNotifyDeps,
): Promise<boolean> {
  if (!(await deps.isEmailEnabled())) return false;
  const to = await deps.getOwnerEmail();
  if (!to) return false;
  const email = renderVerifiedPaymentEmail({ ...input, appOrigin: deps.appOrigin() });
  return deps.send({ to, subject: email.subject, html: email.html, text: email.text });
}

// Wired entry point for the execution path: builds the real deps and swallows
// every error so a notification can never break the Pay Run's response.
export async function notifyVerifiedPayment(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  input: VerifiedNotification,
): Promise<void> {
  try {
    await deliverVerifiedPayment(input, {
      isEmailEnabled: async () => (await getWorkspacePolicy(pool, identity)).notifyEmailEnabled,
      getOwnerEmail: () => resolveOwnerEmail(pool, identity),
      send: sendEmail,
      appOrigin: safeAppOrigin,
    });
  } catch {
    // best-effort: a failed notification never affects the execution outcome.
  }
}
