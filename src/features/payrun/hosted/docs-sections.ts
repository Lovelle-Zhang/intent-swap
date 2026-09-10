import { escapeHtml } from "./ui";
import {
  DECISION_CURL, DECISION_PY, DECISION_JS,
  EXECUTION_CURL, EXECUTION_PY, EXECUTION_JS,
} from "./docs-snippets";

// Public API reference content for /api-docs. Rendered by docs.ts. Code samples
// live in docs-snippets.ts. Everything dynamic is escaped here.

export interface DocSection {
  readonly id: string;
  readonly title: string;
  readonly html: string;
}

const pre = (code: string) => `<pre class="code"><code>${escapeHtml(code)}</code></pre>`;
const lang = (label: string, code: string) => `<p class="lang">${label}</p>${pre(code)}`;
const trio = (curl: string, py: string, js: string) =>
  `${lang("curl", curl)}${lang("Python", py)}${lang("JavaScript", js)}`;

export const DOC_SECTIONS: readonly DocSection[] = [
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
  {
    id: "decision",
    title: "Submit an intent for a decision",
    html: `<p><span class="verb">POST</span> <span class="mono">/api/v1/payruns</span></p>
    <p>Submit a payment intent; ZenFix evaluates it and returns a decision. A <span class="mono">blocked</span> outcome is still a successful call (HTTP 200) — the decision is in the body.</p>
    ${trio(DECISION_CURL, DECISION_PY, DECISION_JS)}
    <p class="muted">Response</p>
    ${pre(`{
  "payRunId": "payrun_...",
  "decision": {
    "outcome": "allowed",          // allowed | needs_review | blocked
    "reasonCodes": [],
    "riskLevel": "low",            // low | medium | critical
    "nextAction": "prepare_funding",
    "checks": [ { "ruleClass": "...", "reasonCode": "...", "outcome": "pass|review|block", "explanation": "..." } ]
  }
}`)}
    <p>The Pay Run and its full rule-by-rule trail are saved to <a class="link" href="/zenfix/payruns">Pay Runs</a>. Reuse an <span class="mono">idempotencyKey</span> to make retries safe.</p>`,
  },
  {
    id: "execution",
    title: "Report execution back",
    html: `<p><span class="verb">POST</span> <span class="mono">/api/v1/payruns/{payRunId}/execution</span></p>
    <p>After your agent executes an <b>allowed</b> (or human-approved) payment on its own rail, report the outcome and proof. ZenFix records it and closes the run at <span class="mono">execution_reported</span>. Only a run awaiting execution accepts a report; anything else returns <span class="mono">409</span>.</p>
    <p><b>Verified execution (recommended).</b> Report <span class="mono">rail: "base-sepolia"</span> (testnet) or <span class="mono">rail: "base-mainnet"</span> (real USDC on Base) with the real <span class="mono">transactionHash</span> (and optionally the <span class="mono">recipient</span> address). ZenFix reads the public chain and confirms the transaction succeeded, moved that chain&rsquo;s USDC, and paid at least the authorized amount — a claim it can't verify is rejected with <span class="mono">422</span>, so an executed run on this rail is proof-backed, not self-reported. If you pin a payout address for the merchant on the <a class="link" href="/zenfix/policy">Policy</a> page, verification additionally requires the transfer to have gone to <b>that</b> address (the agent's claimed recipient can't override it). Other rails are recorded as self-reported.</p>
    <p class="muted">Trying the verified path? Fund a wallet with Base Sepolia test USDC from a faucet (e.g. Circle&rsquo;s), send the payment to your merchant&rsquo;s address using the test USDC token <span class="mono">0x036CbD53842c5426634e7929541eC2318f3dCF7e</span>, then report that transaction hash with <span class="mono">rail: "base-sepolia"</span>.</p>
    ${trio(EXECUTION_CURL, EXECUTION_PY, EXECUTION_JS)}
    <p class="muted">Response</p>
    ${pre(`{ "payRunId": "payrun_...", "status": "execution_reported",
  "report": { "outcome": "executed", "providerReference": "...", "transactionHash": "0x...", "rail": "base", "reportedAt": "..." } }`)}`,
  },
  {
    id: "poll",
    title: "Check a Pay Run's status",
    html: `<p><span class="verb">GET</span> <span class="mono">/api/v1/payruns/{payRunId}</span> · <span class="verb">GET</span> <span class="mono">/api/v1/payruns</span></p>
    <p>Read back a run to see the human review outcome and execution state — this closes the <b>needs_review</b> loop, letting an agent poll for the owner's approve/deny before it pays.</p>
    ${pre(`curl https://intent-swap.app/api/v1/payruns/payrun_... \\
  -H "Authorization: Bearer zfk_live_..."`)}
    <p class="muted">Response</p>
    ${pre(`{
  "payRunId": "payrun_...",
  "status": "approved",            // policy_allowed | pending_review | approved | denied | blocked | execution_reported
  "decision": { "outcome": "needs_review", "reasonCodes": [ ... ], "riskLevel": "medium", "checks": [ ... ] },
  "review":   { "outcome": "approved", "decidedAt": "..." },   // null until a human decides
  "executionReport": null          // set once you report execution
}`)}
    <p>List runs with <span class="mono">GET /api/v1/payruns</span> (newest first). Optional query: <span class="mono">?status=</span>, <span class="mono">?agentId=</span>, <span class="mono">?limit=</span> (default 50, max 100). Both are scoped to your workspace; an id in another workspace returns <span class="mono">404</span>.</p>
    <p class="muted">Prefer push over polling? Set a <b>needs-review webhook</b> on the <a class="link" href="/zenfix/policy">Policy</a> page — ZenFix nudges it when a run needs a decision, and you confirm with this endpoint. Paste a Slack incoming webhook and the nudge arrives as a Slack message.</p>`,
  },
  {
    id: "errors",
    title: "Status codes",
    html: `<ul class="codes">
      <li><span class="mono">200</span> — decision or report recorded (including a <span class="mono">blocked</span> decision).</li>
      <li><span class="mono">400</span> — missing or invalid fields.</li>
      <li><span class="mono">401</span> — missing, malformed, unknown, or revoked API key.</li>
      <li><span class="mono">404</span> — no such Pay Run in your workspace.</li>
      <li><span class="mono">409</span> — the Pay Run is not awaiting execution (already reported, blocked, or under review).</li>
      <li><span class="mono">422</span> — a base-sepolia execution whose on-chain transfer could not be verified (not found, reverted, wrong token, or under the authorized amount).</li>
      <li><span class="mono">503</span> — temporarily unavailable; retry with the same <span class="mono">idempotencyKey</span>.</li>
    </ul>`,
  },
];
