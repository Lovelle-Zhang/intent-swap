import { pre, trio, type DocSection } from "./docs-fmt";
import {
  DECISION_CURL, DECISION_PY, DECISION_JS,
  EXECUTION_CURL, EXECUTION_PY, EXECUTION_JS,
} from "./docs-snippets";

// The HTTP-endpoint sections of /api-docs (decision · execution · poll · audit ·
// status codes). Assembled after the intro sections in docs-sections.ts.

export const API_SECTIONS: readonly DocSection[] = [
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
    id: "audit",
    title: "Tamper-evident audit",
    html: `<p><span class="verb">GET</span> <span class="mono">/api/v1/payruns/{payRunId}/audit</span></p>
    <p>Returns the run&rsquo;s full audit trail as a <b>hash chain</b> — each event carries <span class="mono">entryHash = sha256(prevHash + canonical(event))</span>, linked to the one before it. Anyone can re-derive the chain from the returned JSON and detect any altered, inserted, reordered, or dropped event — without trusting ZenFix.</p>
    ${pre(`{
  "payRunId": "payrun_...",
  "genesis": "0000…",
  "headHash": "9f2c…",
  "events": [
    { "sequence": 1, "actionCode": "payrun.created", "occurredAt": "...", "details": { ... },
      "prevHash": "0000…", "entryHash": "1a7b…" },
    { "sequence": 2, "actionCode": "payrun.transition", "prevHash": "1a7b…", "entryHash": "9f2c…" }
  ]
}`)}
    <p class="muted">A zero-dependency verifier is in the repo at <span class="mono">examples/verify-audit</span>. The table is already append-only; the chain is what lets you check it independently. (Absolute non-repudiation against a full database rewrite needs the head hash anchored externally — on the roadmap.)</p>`,
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
