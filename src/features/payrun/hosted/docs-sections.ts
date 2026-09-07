// Public API reference content for /docs. Plain HTML strings (the JSON samples
// contain no HTML metacharacters, so no escaping is needed here). Rendered by
// docs.ts. Keep this file about content; keep presentation in docs.ts.

export interface DocSection {
  readonly id: string;
  readonly title: string;
  readonly html: string;
}

const pre = (code: string) => `<pre class="code"><code>${code}</code></pre>`;

export const DOC_SECTIONS: readonly DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    html: `<p>ZenFix PayRun is a control layer between your AI agents and real money. Every payment an agent proposes is <b>checked against your policy and logged</b> before anything happens. ZenFix decides <span class="mono">allow</span> / <span class="mono">needs&#8209;review</span> / <span class="mono">block</span> and keeps the full trail — it never holds or moves funds itself. Your agent (or your own system) executes the payment on its own rail, then reports the result back so the audit loop closes.</p>
    <p class="muted">Base URL <span class="mono">https://intent-swap.app</span> · all requests and responses are JSON.</p>`,
  },
  {
    id: "auth",
    title: "Authentication",
    html: `<p>Every request carries a workspace API key as a bearer token:</p>
    ${pre(`Authorization: Bearer zfk_live_...`)}
    <p>Create and revoke keys on the <a class="link" href="/zenfix/keys">API Keys</a> page. The full key is shown once at creation; only a hash is stored, so a lost key can only be revoked, never recovered. A revoked or unknown key returns <span class="mono">401</span>.</p>`,
  },
  {
    id: "policy",
    title: "Your policy",
    html: `<p>Decisions are made against the policy you save on the <a class="link" href="/zenfix/policy">Policy</a> page:</p>
    <ul>
      <li><b>Per-transaction limit</b> — a single payment above it is blocked.</li>
      <li><b>Review threshold</b> — at or above it, a payment needs review before it can proceed.</li>
      <li><b>Absolute hard limit</b> — the ceiling no payment may cross.</li>
      <li><b>Allowed / blocked merchants</b> — a merchant not on the allowlist is blocked; new allowlisted merchants can require review.</li>
      <li><b>Blocked categories</b> — merchant categories that are always denied.</li>
    </ul>
    <p class="muted">Amounts are USDC. Change the policy anytime; it applies to every subsequent decision.</p>`,
  },
  {
    id: "decision",
    title: "Submit an intent for a decision",
    html: `<p><span class="verb">POST</span> <span class="mono">/api/v1/payruns</span></p>
    <p>Submit a payment intent. ZenFix evaluates it and returns a decision. A <span class="mono">blocked</span> outcome is still a successful call (HTTP 200) — the decision is in the body.</p>
    ${pre(`curl -X POST https://intent-swap.app/api/v1/payruns \\
  -H "Authorization: Bearer zfk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "agent_ops_01",
    "purpose": "Buy a verified API result",
    "amount": "12.50",
    "merchant": { "id": "acme_api", "payee": "ACME", "category": "api" },
    "artifactType": "api_result",
    "idempotencyKey": "optional-retry-safe-key"
  }'`)}
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
    <p>After your agent executes an <b>allowed</b> payment on its own rail, report the outcome and proof. ZenFix records it and closes the run at the terminal status <span class="mono">execution_reported</span>. Only a run awaiting execution (an allowed decision) accepts a report; anything else returns <span class="mono">409</span>.</p>
    ${pre(`curl -X POST https://intent-swap.app/api/v1/payruns/payrun_.../execution \\
  -H "Authorization: Bearer zfk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "outcome": "executed",         // executed | failed
    "providerReference": "stripe_pi_3Q...",
    "transactionHash": "0x...",    // optional
    "rail": "base",                // optional
    "artifactReference": "..."     // optional
  }'`)}
    <p class="muted">Response</p>
    ${pre(`{ "payRunId": "payrun_...", "status": "execution_reported",
  "report": { "outcome": "executed", "providerReference": "...", "transactionHash": "0x...", "rail": "base", "reportedAt": "..." } }`)}`,
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
      <li><span class="mono">503</span> — ZenFix is temporarily unavailable; retry with the same <span class="mono">idempotencyKey</span>.</li>
    </ul>`,
  },
];
