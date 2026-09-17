import { atomicToUsdc } from "./policy-form";
import { explorerTxUrl, railLabel } from "./onchain-verify";
import { escapeHtml } from "./ui";

// The verified-payment email IS the product thesis in an inbox: a Pay Run that
// ZenFix confirmed on-chain, rendered as a forwardable receipt. It carries the
// decision, the amount, the transaction hash, and — load-bearing — a link to the
// PUBLIC block explorer, so the recipient verifies the truth themselves instead
// of trusting us. Deliberately text/HTML (no hero image): Gmail blocks images by
// default, and the persuasion lives in the words and the explorer link, not a
// picture. Light "receipt" card so it renders and prints legibly everywhere.

export interface VerifiedPaymentEmailData {
  readonly payRunId: string;
  readonly agentId: string;
  readonly purpose: string;
  readonly amountAtomic: string;
  readonly asset: string;
  readonly rail: string; // base-sepolia | base-mainnet
  readonly transactionHash: string;
  readonly recipient: string | null;
  readonly pinnedMerchant: boolean;
  readonly appOrigin: string; // e.g. https://intent-swap.app
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

function short(value: string): string {
  const v = value.trim();
  return v.length <= 14 ? v : `${v.slice(0, 8)}…${v.slice(-6)}`;
}

function row(label: string, valueHtml: string): string {
  return `<tr><td style="padding:7px 0;color:#78716c;font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:7px 0 7px 18px;color:#1c1917;font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:right;word-break:break-word">${valueHtml}</td></tr>`;
}

const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export function renderVerifiedPaymentEmail(data: VerifiedPaymentEmailData): RenderedEmail {
  const usdc = `${atomicToUsdc(data.amountAtomic)} ${data.asset}`;
  const chain = railLabel(data.rail);
  const explorer = explorerTxUrl(data.rail, data.transactionHash);
  const runUrl = `${data.appOrigin}/zenfix/payruns/${encodeURIComponent(data.payRunId)}`;
  const auditUrl = `${data.appOrigin}/api/v1/payruns/${encodeURIComponent(data.payRunId)}/audit`;
  const testnet = data.rail === "base-sepolia";

  const subject = `✓ ${usdc} verified on-chain — ZenFix Pay Run`;
  const preheader = `Verified on ${chain}. You don't have to trust ZenFix — open the transaction on the public explorer.`;

  const recipientRow = data.recipient
    ? row("Paid to", `<span style="${MONO};font-size:12px">${escapeHtml(short(data.recipient))}</span>${data.pinnedMerchant ? ` <span style="color:#06705f;font-size:11px">· pinned</span>` : ""}`)
    : "";
  const explorerBtn = explorer
    ? `<a href="${escapeHtml(explorer)}" style="display:inline-block;background:#0b8f7d;color:#ffffff;text-decoration:none;font:600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:12px 22px;border-radius:9px">Verify on ${escapeHtml(chain === "Base Sepolia" ? "Basescan" : "the explorer")} →</a>`
    : "";

  const html = `<!-- ${escapeHtml(preheader)} -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f3;padding:28px 0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden">
  <tr><td style="padding:22px 26px 0">
    <span style="font:700 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917">ZenFix</span>${testnet ? ` <span style="font:600 10px system-ui;letter-spacing:.08em;color:#b45309;border:1px solid #f4c67a;border-radius:5px;padding:2px 6px">TEST MODE</span>` : ""}
  </td></tr>
  <tr><td style="padding:16px 26px 0">
    <span style="display:inline-block;background:#e7f8f4;color:#06705f;font:600 12px system-ui;letter-spacing:.04em;border-radius:999px;padding:5px 12px">✓ Verified on-chain</span>
    <div style="font:600 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;margin:14px 0 2px">${escapeHtml(usdc)} paid &amp; confirmed</div>
    <div style="font:14px system-ui;color:#78716c">${escapeHtml(data.purpose)}</div>
  </td></tr>
  <tr><td style="padding:16px 26px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0efee">
      ${row("Pay Run", `<span style="${MONO};font-size:12px">${escapeHtml(data.payRunId)}</span>`)}
      ${row("Agent", `<span style="${MONO};font-size:12px">${escapeHtml(data.agentId)}</span>`)}
      ${row("Amount", `<b>${escapeHtml(usdc)}</b>`)}
      ${row("Chain", escapeHtml(chain))}
      ${recipientRow}
      ${row("Transaction", `<span style="${MONO};font-size:12px">${escapeHtml(short(data.transactionHash))}</span>`)}
    </table>
  </td></tr>
  <tr><td style="padding:20px 26px 4px">${explorerBtn}</td></tr>
  <tr><td style="padding:12px 26px 0;font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#57534e;line-height:1.5">
    You don't have to trust ZenFix — open the transaction on the public explorer and see it for yourself. Or read the tamper-evident <a href="${escapeHtml(auditUrl)}" style="color:#0b8f7d">audit trail</a> and the <a href="${escapeHtml(runUrl)}" style="color:#0b8f7d">Pay Run</a>.
  </td></tr>
  <tr><td style="padding:18px 26px 24px;margin-top:8px;font:12px system-ui;color:#a8a29e;line-height:1.5;border-top:1px solid #f0efee">
    ZenFix is the authorization and audit layer for agent payments — it decides and verifies, and never holds your funds or keys.${testnet ? " Test mode on Base Sepolia — no real funds." : ""}<br>
    You're getting this because on-chain verification emails are on for your workspace. Turn them off on the <a href="${escapeHtml(data.appOrigin)}/zenfix/policy" style="color:#a8a29e">Policy page</a>.
  </td></tr>
</table>
</td></tr></table>`;

  const text = [
    `✓ Verified on-chain — ${usdc} paid & confirmed`,
    ``,
    data.purpose,
    ``,
    `Pay Run:     ${data.payRunId}`,
    `Agent:       ${data.agentId}`,
    `Amount:      ${usdc}`,
    `Chain:       ${chain}`,
    data.recipient ? `Paid to:     ${data.recipient}${data.pinnedMerchant ? " (pinned)" : ""}` : "",
    `Transaction: ${data.transactionHash}`,
    ``,
    explorer ? `Verify it yourself on the public explorer:\n${explorer}` : "",
    `Pay Run:     ${runUrl}`,
    `Audit trail: ${auditUrl}`,
    ``,
    `You don't have to trust ZenFix — the transaction is on the public chain.`,
    `ZenFix decides and verifies agent payments; it never holds your funds or keys.`,
    `Turn these emails off on the Policy page: ${data.appOrigin}/zenfix/policy`,
  ].filter((line) => line !== "").join("\n");

  return { subject, html, text };
}
