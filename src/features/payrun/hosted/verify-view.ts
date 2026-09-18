import type { ExecutionReport } from "../domain/types";
import { type AtomicMoneyView, formatAtomicMoney } from "../presentation/money";
import { explorerTxUrl, isVerifiedRail, railLabel } from "./onchain-verify";
import { escapeHtml } from "./ui";

// The hero of a completed Pay Run: what "verified on-chain" actually proved.
// ZenFix never moves funds — its product is the verification. On a verified rail
// an `executed` outcome only reaches the ledger AFTER we matched the claim to a
// real USDC transfer (right token, amount >= authorized, receipt success). This
// panel makes that load-bearing fact legible and links the public explorer so a
// reader can re-check it without trusting us. The transfer is also bound one-to-one
// to this Pay Run (a UNIQUE (rail, transactionHash) claim recorded in the report's
// unit of work), so the same transfer can't be reused to satisfy another run. What
// it must still NOT claim: L1 finality — we read the receipt, not a finalized
// block. See the receipt copy, kept honest.

const SEAL = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Self-reported gets a clock, not a check: the outcome is claimed and awaiting
// (or ineligible for) independent proof — a tick would overstate our confidence.
const CLOCK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="2.2"/><path d="M12 7.6v4.6l3 1.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const TICK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const OUT = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

interface Point { readonly html: string; readonly warn?: boolean }
function point(p: Point): string {
  return `<li${p.warn ? ' class="warn"' : ""}><span class="verify-tick">${TICK}</span><span>${p.html}</span></li>`;
}

// Compact UTC stamp for "when ZenFix checked" — verification runs synchronously
// with the report, so reportedAt is the moment we read the chain.
function fmtUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function renderVerificationCard(
  report: ExecutionReport | null | undefined,
  authorized: AtomicMoneyView,
): string {
  if (!report || report.outcome !== "executed") return "";
  const amt = escapeHtml(formatAtomicMoney(authorized));

  // "Verified on-chain" is claimed ONLY when a verification was actually persisted
  // (which requires a pinned merchant payout address — the trust anchor). A verified
  // rail without that anchor is recorded as self-reported, not proof-backed.
  if (!isVerifiedRail(report.rail) || !report.verification) {
    const rail = escapeHtml(railLabel(report.rail));
    const why = isVerifiedRail(report.rail)
      ? `ZenFix can independently verify a payment only against a payout address you've <b>pinned</b> for this merchant — without one, an unrelated transfer could satisfy the check, so this is recorded as <b>claimed</b>, not proven. Pin the merchant's address on Policy to earn an on-chain-verified receipt.`
      : `ZenFix can't confirm it from the chain, and doesn't hold the merchant credentials that could — so it's recorded as <b>claimed</b>, not proven. Run the payment on a verified rail (Base) with a pinned merchant address for independent on-chain proof.`;
    return `<div class="card verify plain">
      <div class="verify-head"><span class="verify-seal">${CLOCK}</span>
        <span class="verify-title">Self-reported<small>Not verified on-chain</small></span></div>
      <p class="verify-lead">This outcome was reported by the agent on the <b>${rail}</b> rail. ${why}</p>
    </div>`;
  }

  const chain = escapeHtml(railLabel(report.rail));
  const url = explorerTxUrl(report.rail, report.transactionHash);
  const v = report.verification;
  const addr = (a: string) => `<code>${escapeHtml(shortAddr(a))}</code>`;

  // Facts we proved (recipient, payer binding, pinned match, exact amount) exist
  // only when verification was persisted; older verified-rail reports fall back to
  // the generic guarantees, which still hold for any executed verified-rail run.
  const points: Point[] = [];
  points.push({
    // State only what was proven: a real transfer to the address the chain shows.
    // Whether that address was the AUTHORIZED one is a separate claim, made below
    // only when a pinned merchant address actually matched — never assert "the
    // authorized recipient" here, since without a pin no recipient is required.
    html: v
      ? `<b>Real on-chain transfer.</b> A USDC transfer to ${addr(v.recipient)} was found on ${chain}'s USDC contract.`
      : `<b>Real on-chain transfer.</b> A USDC transfer was found on ${chain}'s USDC contract.`,
  });
  if (v?.pinnedMerchant) {
    points.push({ html: `<b>Matched your pinned address.</b> That recipient is the payout address you locked for this merchant — not one the agent chose.` });
  }
  if (v?.sender) {
    points.push({ html: `<b>Payer wallet bound.</b> The transfer came from the authorizing wallet ${addr(v.sender)} — a facilitator can't swap in another payer.` });
  }
  if (v) {
    // Show the actual amount, and flag an over-payment — "at least the authorized"
    // would paint an over-pay (a loss to the payer) all-green.
    const actual = escapeHtml(formatAtomicMoney({ amountAtomic: v.amountAtomic, asset: authorized.asset, decimals: authorized.decimals }));
    const over = BigInt(v.amountAtomic) > BigInt(authorized.amountAtomic);
    points.push(over
      ? { html: `<b>Over the authorized amount.</b> Transferred <b>${actual}</b> — more than the authorized ${amt}.`, warn: true }
      : { html: `<b>Amount matches.</b> Transferred <b>${actual}</b>, the authorized amount.` });
  } else {
    points.push({ html: `<b>Amount ≥ authorized.</b> The on-chain transfer was at least the authorized <b>${amt}</b>.` });
  }
  points.push({ html: `<b>Confirmed on-chain.</b> The transaction receipt shows it succeeded on ${chain}.` });
  if (v) {
    // The one-to-one binding is enforced only for reports recorded through the
    // verified path (which is exactly when verification is persisted), so claim
    // it only when that proof is present.
    points.push({ html: `<b>Bound to this Pay Run.</b> This transfer is recorded against this Pay Run alone — the same transaction can't be reused to verify another.` });
  }
  points.push({ html: `<b>Independently checkable.</b> You don't have to trust ZenFix — open the transaction on the public explorer.` });

  const explore = url
    ? `<a class="verify-explore" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Verify on the explorer ${OUT}</a>`
    : "";
  const hash = report.transactionHash ? `<span class="verify-hash">${escapeHtml(report.transactionHash)}</span>` : "";
  const checked = `<span class="verify-stamp">Checked ${escapeHtml(fmtUtc(report.reportedAt))}</span>`;
  return `<div class="card verify">
    <div class="verify-head"><span class="verify-seal">${SEAL}</span>
      <span class="verify-title">Verified on-chain<small>Proven against ${chain} — not self-reported</small></span></div>
    <p class="verify-lead">This payment wasn't taken on trust. Before recording the outcome, ZenFix matched the agent's claim to a real USDC transfer on ${chain} and confirmed the transaction succeeded.</p>
    <ul class="verify-points">${points.map(point).join("")}</ul>
    <div class="verify-verifyself">${explore}${hash}${checked}</div>
  </div>`;
}

// 0x1234…cdef — enough to recognise an address without dominating the line.
function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
