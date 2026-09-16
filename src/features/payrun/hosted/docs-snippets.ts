// Raw code samples for the public API reference (/api-docs), kept out of
// docs-sections.ts so both files stay small. Plain strings; docs-sections wraps
// each in an escaped, labelled <pre> via its langBlock helper.

const BASE = "https://intent-swap.app";

export const DECISION_CURL = `curl -X POST ${BASE}/api/v1/payruns \\
  -H "Authorization: Bearer zfk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "agent_ops_01",
    "purpose": "Buy a verified API result",
    "amount": "12.50",
    "merchant": { "id": "acme_api", "payee": "ACME", "category": "api" },
    "artifactType": "api_result",
    "idempotencyKey": "optional-retry-safe-key"
  }'`;

export const DECISION_PY = `import requests

r = requests.post(
    "${BASE}/api/v1/payruns",
    headers={"Authorization": "Bearer zfk_live_..."},
    json={
        "agentId": "agent_ops_01",
        "purpose": "Buy a verified API result",
        "amount": "12.50",
        "merchant": {"id": "acme_api", "payee": "ACME", "category": "api"},
        "artifactType": "api_result",
    },
)
decision = r.json()["decision"]
# decision["outcome"] is "allowed" | "needs_review" | "blocked"`;

export const DECISION_JS = `const res = await fetch("${BASE}/api/v1/payruns", {
  method: "POST",
  headers: {
    "Authorization": "Bearer zfk_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agentId: "agent_ops_01",
    purpose: "Buy a verified API result",
    amount: "12.50",
    merchant: { id: "acme_api", payee: "ACME", category: "api" },
    artifactType: "api_result",
  }),
});
const { payRunId, decision } = await res.json();`;

// The recommended, verified path: report the real on-chain transfer so the run
// closes proof-backed, not self-reported. `sender` binds the proof to the paying
// wallet (x402/EIP-3009). Drop rail/transactionHash/sender to record a plain
// self-reported outcome instead.
export const EXECUTION_CURL = `curl -X POST ${BASE}/api/v1/payruns/PAYRUN_ID/execution \\
  -H "Authorization: Bearer zfk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "outcome": "executed", "providerReference": "agent-run-42",
        "rail": "base-sepolia", "transactionHash": "0x...",
        "sender": "0xYourAgentWallet" }'`;

export const EXECUTION_PY = `requests.post(
    f"${BASE}/api/v1/payruns/{pay_run_id}/execution",
    headers={"Authorization": "Bearer zfk_live_..."},
    json={"outcome": "executed", "providerReference": "agent-run-42",
          "rail": "base-sepolia", "transactionHash": "0x...",
          "sender": "0xYourAgentWallet"},
)`;

export const EXECUTION_JS = `await fetch(\`${BASE}/api/v1/payruns/\${payRunId}/execution\`, {
  method: "POST",
  headers: {
    "Authorization": "Bearer zfk_live_...",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    outcome: "executed",
    providerReference: "agent-run-42",
    rail: "base-sepolia",
    transactionHash: "0x...",
    sender: "0xYourAgentWallet",
  }),
});`;
