import type { OnboardingState } from "./onboarding";
import { escapeHtml } from "./ui";

// Renders the Overview "Get started" checklist — a guided path from sign-in to
// the first real agent payment being gated. Returns "" once complete so the
// dashboard reclaims the space. Dumb renderer; all state comes from onboarding.ts.

const FIRST_INTENT_CURL = `curl https://intent-swap.app/api/v1/payruns \\
  -H "Authorization: Bearer zfk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "agent_ops_01",
    "purpose": "Buy the Q3 dataset",
    "amount": "20",
    "merchant": { "id": "acme_api", "payee": "ACME", "category": "api" },
    "artifactType": "api_result"
  }'`;

function step(done: boolean, n: number, title: string, bodyHtml: string): string {
  const marker = done ? `<span class="ob-mk done">✓</span>` : `<span class="ob-mk">${n}</span>`;
  return `<li class="${done ? "done" : ""}">${marker}<div class="ob-body"><b>${escapeHtml(title)}</b>${bodyHtml}</div></li>`;
}

// A zero-setup "aha": before the four real steps (which need a key, a policy, an
// agent, and — the finish line — a funded wallet), let a brand-new user watch the
// control layer decide a Pay Run in one click. It runs the real hosted loop into
// THEIR workspace via /zenfix/payruns/create, so the run lands in their own ledger
// with the full decision and trail — value seen before any wallet is opened. It
// stops showing once they've sent a real agent intent (step 3), where it'd be noise.
function tryItLead(): string {
  return `<form class="ob-try" action="/zenfix/payruns/create" method="post"><input type="hidden" name="scenarioId" value="allowed" /><p class="muted">New here? <b>Run a sample Pay Run</b> — one click, in this workspace, no key or wallet needed. It lands in your ledger with the full decision and audit trail, so you can see the layer work before wiring up your agent below.</p><button type="submit" class="btn">Run a sample Pay Run →</button></form>`;
}

export function renderOnboarding(state: OnboardingState): string {
  if (state.complete) return "";
  const items = [
    step(state.hasKey, 1, "Create an API key",
      `<p class="muted">Your agent authenticates with a workspace key (the full <code>zfk_live_…</code> is shown once).</p><a class="link" href="/zenfix/keys">Create a key →</a>`),
    step(state.hasPolicy, 2, "Set your policy",
      `<p class="muted">Decide the limits, allowed merchants, and budgets every payment is checked against.</p><a class="link" href="/zenfix/policy">Open Policy →</a>`),
    step(state.hasApiRun, 3, "Send your agent's first intent",
      `<p class="muted">Have your agent POST an intent — ZenFix decides allow / needs&#8209;review / block and logs it. The run appears below.</p><pre class="curl"><code>${escapeHtml(FIRST_INTENT_CURL)}</code></pre><a class="link" href="/api-docs">Full API reference →</a>`),
    step(state.hasVerifiedPayment, 4, "See a verified payment",
      `<p class="muted">Have your agent pay on Base and report the on-chain <code>transactionHash</code> with <code>rail: "base-sepolia"</code>. ZenFix reads the chain and the run closes <b>Verified on&#8209;chain</b> — proof&#8209;backed, not self&#8209;reported. Test USDC is free from a faucet.</p><a class="link" href="/api-docs#execution">Report a verified payment →</a>`),
  ].join("");
  const flags = [state.hasKey, state.hasPolicy, state.hasApiRun, state.hasVerifiedPayment];
  const doneCount = flags.filter(Boolean).length;
  const tryIt = state.hasApiRun ? "" : tryItLead();
  return `<div class="card"><h2>Get started · ${doneCount}/${flags.length}</h2><p class="lead">Four steps from zero to a verified agent payment.</p>${tryIt}<ol class="onboard">${items}</ol></div>`;
}
