// ZenFix PayRun — ICP demo: an autonomous agent that BUYS DATA per call, with
// every payment authorized, recorded, and (on-chain) verifiable by ZenFix.
//
// "Scout" runs a competitor-analysis task that needs several paid data pulls.
// Before each purchase it asks ZenFix — which decides allow / needs_review /
// block against the workspace policy. Scout pays only what clears, then the
// operator sees the whole governed spend + audit trail in the ZenFix dashboard.
//
// The DATA calls here are simulated; the PAYMENT GOVERNANCE is real — this runs
// against your live ZenFix workspace. ZenFix never holds your funds or keys.
//
// Setup: create a key (API Keys) and allow "acme_api" (Policy → Allowed
// merchants) — the default policy's $50 review threshold drives the review step.
//   ZENFIX_KEY=zfk_live_... node agent.mjs

const BASE = process.env.ZENFIX_BASE ?? "https://intent-swap.app";
const KEY = process.env.ZENFIX_KEY;
if (!KEY) { console.error("Set ZENFIX_KEY."); process.exit(1); }
const auth = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const submit = (intent) => fetch(`${BASE}/api/v1/payruns`, { method: "POST", headers: auth, body: JSON.stringify(intent) }).then(r => r.json());
const report = (id, proof) => fetch(`${BASE}/api/v1/payruns/${id}/execution`, { method: "POST", headers: auth, body: JSON.stringify(proof) }).then(r => r.json());

// What Scout needs to buy for the analysis. acme_api is the trusted data vendor;
// grey_market_scraper is an unvetted source Scout might be tempted by.
const SHOPPING_LIST = [
  { need: "Q3 pricing dataset",        amount: "8",  merchant: { id: "acme_api", payee: "ACME Data", category: "api" } },
  { need: "12-month demand history",   amount: "6",  merchant: { id: "acme_api", payee: "ACME Data", category: "api" } },
  { need: "Full annual data license",  amount: "60", merchant: { id: "acme_api", payee: "ACME Data", category: "api" } },
  { need: "Bulk scrape (cheap)",       amount: "3",  merchant: { id: "grey_market_scraper", payee: "Grey Market", category: "api" } },
];

const tally = { bought: 0, parked: 0, blocked: 0, spent: 0 };

async function acquire(item) {
  const { need, amount, merchant } = item;
  console.log(`\n• Need: ${need} — ${amount} USDC from ${merchant.id}`);
  const res = await submit({ agentId: "scout", purpose: need, amount, merchant, artifactType: "api_result", idempotencyKey: `scout-${need}-${Date.now()}` });
  const d = res.decision;
  console.log(`  ZenFix: ${d.outcome}${d.reasonCodes?.length ? " (" + d.reasonCodes.join(",") + ")" : ""}`);
  if (d.outcome === "blocked") { tally.blocked++; console.log("  → skip: not paying an unvetted source."); return; }
  if (d.outcome === "needs_review") { tally.parked++; console.log(`  → parked for a human (${res.payRunId}); Scout moves on.`); return; }
  // allowed: pay on Scout's own rail (simulated) and consume the data.
  const ref = `sim_${Math.random().toString(16).slice(2, 10)}`;
  await report(res.payRunId, { outcome: "executed", providerReference: ref, rail: "base", transactionHash: `0x${ref}${ref}` });
  tally.bought++; tally.spent += Number(amount);
  console.log(`  → paid & fetched. (analysis uses "${need}")`);
}

console.log("Scout — Q3 competitor analysis. Every purchase is governed by ZenFix.");
for (const item of SHOPPING_LIST) await acquire(item);

console.log(`\n─────────────\nDone. Bought ${tally.bought} · parked ${tally.parked} (needs review) · blocked ${tally.blocked}. Authorized spend: ${tally.spent} USDC.`);
console.log("Open your ZenFix Overview → every decision, the spend, and the full audit trail are there.\n");
