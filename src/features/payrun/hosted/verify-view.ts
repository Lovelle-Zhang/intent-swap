import type { ExecutionReport } from "../domain/types";
import { explorerTxUrl, isVerifiedRail, railLabel } from "./onchain-verify";
import { escapeHtml } from "./ui";

// The hero of a completed Pay Run: what "verified on-chain" actually proved.
// ZenFix never moves funds — its product is the verification. On a verified rail
// an `executed` outcome only reaches the ledger AFTER we matched the claim to a
// real USDC transfer (right token, amount >= authorized, settled). This panel
// makes that load-bearing fact legible, and links the public explorer so a
// reader can re-check it without trusting us.

const SEAL = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const TICK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const OUT = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function point(html: string): string {
  return `<li><span class="verify-tick">${TICK}</span><span>${html}</span></li>`;
}

// `authorizedAmount` is the already-formatted intent amount (e.g. "20.00 USDC").
export function renderVerificationCard(
  report: ExecutionReport | null | undefined,
  authorizedAmount: string,
): string {
  if (!report || report.outcome !== "executed") return "";
  const amt = escapeHtml(authorizedAmount);

  if (!isVerifiedRail(report.rail)) {
    const rail = escapeHtml(railLabel(report.rail));
    return `<div class="card verify plain">
      <div class="verify-head"><span class="verify-seal">${SEAL}</span>
        <span class="verify-title">Self-reported<small>Not verified on-chain</small></span></div>
      <p class="verify-lead">This outcome was reported by the agent on the <b>${rail}</b> rail, which ZenFix can't independently verify. It's recorded as <b>claimed</b>, not proven. Run the payment on a verified rail (Base) to get on-chain proof.</p>
    </div>`;
  }

  const chain = escapeHtml(railLabel(report.rail));
  const url = explorerTxUrl(report.rail, report.transactionHash);
  const v = report.verification;
  const addr = (a: string) => `<code>${escapeHtml(shortAddr(a))}</code>`;

  // The specific facts we proved (payer binding, pinned-address match) exist only
  // when verification was persisted; older verified-rail reports fall back to the
  // generic guarantees, which still hold for any executed verified-rail run.
  const points: string[] = [];
  points.push(v
    ? `<b>Paid the verified recipient.</b> A USDC transfer to ${addr(v.recipient)} was found on ${chain}'s USDC contract.`
    : `<b>Real on-chain transfer.</b> A USDC transfer to the authorized recipient was found on ${chain}'s USDC contract.`);
  if (v?.pinnedMerchant) {
    points.push(`<b>Matched your pinned address.</b> That recipient is the payout address you locked for this merchant — not one the agent chose.`);
  }
  if (v?.sender) {
    points.push(`<b>Payer wallet bound.</b> The transfer came from the authorizing wallet ${addr(v.sender)} — a facilitator can't swap in another payer.`);
  }
  points.push(`<b>Amount honored.</b> The on-chain transfer was at least the authorized <b>${amt}</b>.`);
  points.push(`<b>Settled successfully.</b> The transaction receipt confirms it succeeded and is final.`);
  points.push(`<b>Independently checkable.</b> You don't have to trust ZenFix — open the transaction on the public explorer.`);

  const verifySelf = url
    ? `<div class="verify-verifyself"><a class="verify-explore" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Verify on the explorer ${OUT}</a><span class="verify-hash">${escapeHtml(report.transactionHash ?? "")}</span></div>`
    : "";
  return `<div class="card verify">
    <div class="verify-head"><span class="verify-seal">${SEAL}</span>
      <span class="verify-title">Verified on-chain<small>Proven against ${chain} — not self-reported</small></span></div>
    <p class="verify-lead">This payment wasn't taken on trust. Before recording the outcome, ZenFix matched the agent's claim to a real USDC transfer on ${chain} and confirmed it settled.</p>
    <ul class="verify-points">${points.map(point).join("")}</ul>
    ${verifySelf}
  </div>`;
}

// 0x1234…cdef — enough to recognise an address without dominating the line.
function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
