import { pre, trio, type DocSection } from "./docs-fmt";
import { DECISION_CURL, DECISION_PY, DECISION_JS } from "./docs-snippets";
import { API_SECTIONS } from "./docs-api-sections";

// Public API reference content for /api-docs. Rendered by docs.ts. The intro
// sections are here; the HTTP-endpoint sections are in docs-api-sections.ts;
// code samples in docs-snippets.ts; formatting helpers in docs-fmt.ts.
export type { DocSection } from "./docs-fmt";

const INTRO_SECTIONS: readonly DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    html: `<p>ZenFix PayRun is a control layer between your AI agents and real money. Every payment an agent proposes is <b>checked against your policy and logged</b> before anything happens — ZenFix decides <span class="mono">allow</span> / <span class="mono">needs&#8209;review</span> / <span class="mono">block</span> and keeps the full trail. It never holds or moves funds: your agent executes the payment on its own rail and reports the result back so the audit loop closes.</p>
    <p class="muted">Base URL <span class="mono">https://intent-swap.app</span> · all requests and responses are JSON.</p>`,
  },
  {
    id: "quickstart",
    title: "Quickstart",
    html: `<ol>
      <li>Create an API key on the <a class="link" href="/zenfix/keys">API Keys</a> page — the full <span class="mono">zfk_live_…</span> key is shown once.</li>
      <li>Set your rules on the <a class="link" href="/zenfix/policy">Policy</a> page (limits, allowed merchants, daily budget).</li>
      <li>Submit an intent:</li>
    </ol>
    ${trio(DECISION_CURL, DECISION_PY, DECISION_JS)}
    <p>Then branch on <span class="mono">decision.outcome</span>:</p>
    <ul>
      <li><b>allowed</b> — execute the payment on your own rail, then report it back (below).</li>
      <li><b>needs_review</b> — a workspace owner approves or denies it on the Pay Run's page; poll <span class="mono">GET /api/v1/payruns/{id}</span> for the outcome, then report execution once approved.</li>
      <li><b>blocked</b> — do not pay; <span class="mono">reasonCodes</span> explain why.</li>
    </ul>`,
  },
  {
    id: "recipe",
    title: "Recipe: zero → a verified payment",
    html: `<p>The full journey — from an empty workspace to a payment ZenFix has confirmed on-chain — in about 15 minutes.</p>
    <ol>
      <li><b>Key.</b> Create an API key on <a class="link" href="/zenfix/keys">API Keys</a>.</li>
      <li><b>Policy.</b> On <a class="link" href="/zenfix/policy">Policy</a>, add your merchant to <i>Allowed merchants</i> and set limits/budget. To bind the payee, also set <i>Merchant payout addresses</i> (<span class="mono">merchantId = 0x…</span>).</li>
      <li><b>Test USDC.</b> Fund a wallet with Base Sepolia test USDC from a faucet (e.g. Circle&rsquo;s); token <span class="mono">0x036CbD53842c5426634e7929541eC2318f3dCF7e</span>.</li>
      <li><b>Propose.</b> <span class="verb">POST</span> <span class="mono">/api/v1/payruns</span> — if the decision is <span class="mono">allowed</span>, continue; if <span class="mono">needs_review</span>, approve it in-app (or wire a <a class="link" href="/zenfix/policy">Slack webhook</a>) and poll until approved.</li>
      <li><b>Pay + prove.</b> Send the USDC on Base Sepolia to the pinned address, then <span class="verb">POST</span> <span class="mono">/api/v1/payruns/{id}/execution</span> with <span class="mono">rail:"base-sepolia"</span> and the <span class="mono">transactionHash</span>. ZenFix reads the chain; the run closes as <b>Verified on-chain</b> — or 422 if the proof doesn&rsquo;t check out.</li>
    </ol>
    <p class="muted">A runnable, zero-dependency reference agent (all of this end to end) is in the repo under <span class="mono">examples/aria-agent</span>.</p>`,
  },
  {
    id: "auth",
    title: "Authentication",
    html: `<p>Every request carries a workspace API key as a bearer token:</p>
    ${pre(`Authorization: Bearer zfk_live_...`)}
    <p>Manage keys on the <a class="link" href="/zenfix/keys">API Keys</a> page. Only a hash is stored, so a lost key can only be revoked, never recovered. A revoked or unknown key returns <span class="mono">401</span>.</p>`,
  },
  {
    id: "policy",
    title: "Your policy",
    html: `<p>Decisions are made against the policy you save on the <a class="link" href="/zenfix/policy">Policy</a> page:</p>
    <ul>
      <li><b>Per-transaction limit</b> — a single payment above it is blocked.</li>
      <li><b>Review threshold</b> — at or above it, a payment needs review first.</li>
      <li><b>Absolute hard limit</b> — the ceiling no payment may cross.</li>
      <li><b>Daily budget</b> — authorized spend per UTC day; over it, further payments are blocked.</li>
      <li><b>Allowed / blocked merchants + categories</b> — a merchant not on the allowlist is blocked.</li>
    </ul>
    <p class="muted">Amounts are USDC. Changes apply to every subsequent decision.</p>`,
  },
];

export const DOC_SECTIONS: readonly DocSection[] = [...INTRO_SECTIONS, ...API_SECTIONS];
