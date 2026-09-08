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

export function renderOnboarding(state: OnboardingState): string {
  if (state.complete) return "";
  const items = [
    step(state.hasKey, 1, "Create an API key",
      `<p class="muted">Your agent authenticates with a workspace key (the full <code>zfk_live_…</code> is shown once).</p><a class="link" href="/zenfix/keys">Create a key →</a>`),
    step(state.hasPolicy, 2, "Set your policy",
      `<p class="muted">Decide the limits, allowed merchants, and budgets every payment is checked against.</p><a class="link" href="/zenfix/policy">Open Policy →</a>`),
    step(state.hasApiRun, 3, "Send your agent's first intent",
      `<p class="muted">Have your agent POST an intent — ZenFix decides allow / needs&#8209;review / block and logs it. The run appears below.</p><pre class="curl"><code>${escapeHtml(FIRST_INTENT_CURL)}</code></pre><a class="link" href="/api-docs">Full API reference →</a>`),
  ].join("");
  const doneCount = [state.hasKey, state.hasPolicy, state.hasApiRun].filter(Boolean).length;
  return `<div class="card"><h2>Get started · ${doneCount}/3</h2><p class="lead">Three steps to gate your first real agent payment.</p><ol class="onboard">${items}</ol></div>`;
}
