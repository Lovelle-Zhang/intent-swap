// ZenFix PayRun — reference agent integration (zero dependencies, Node 18+).
//
// This is the whole loop an agent uses to pay under a workspace's policy:
//   1. submit an intent            -> ZenFix decides allow / needs_review / block
//   2. if needs_review             -> poll until a human approves or denies
//   3. if allowed/approved         -> execute on YOUR rail, then report the proof
//   4. ZenFix records + (on base-sepolia) verifies it on-chain. Audit closed.
//
// ZenFix never holds your funds or keys — you execute; it authorizes + verifies.
//
// Run:
//   ZENFIX_KEY=zfk_live_... node agent.mjs
// To exercise on-chain VERIFIED execution, also pass a real Base Sepolia USDC
// transfer you broadcast to the merchant's address (see README):
//   ZENFIX_KEY=zfk_live_... TX_HASH=0x... RECIPIENT=0x... node agent.mjs

const BASE = process.env.ZENFIX_BASE ?? "https://intent-swap.app";
const KEY = process.env.ZENFIX_KEY;
if (!KEY) { console.error("Set ZENFIX_KEY (create one on the API Keys page)."); process.exit(1); }
const auth = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// --- the ZenFix client: four calls are all you need -------------------------
const submit = (intent) =>
  fetch(`${BASE}/api/v1/payruns`, { method: "POST", headers: auth, body: JSON.stringify(intent) }).then(json);
const getRun = (id) =>
  fetch(`${BASE}/api/v1/payruns/${id}`, { headers: auth }).then(json);
const report = (id, proof) =>
  fetch(`${BASE}/api/v1/payruns/${id}/execution`, { method: "POST", headers: auth, body: JSON.stringify(proof) }).then(json);
async function json(res) { return { http: res.status, body: await res.json() }; }

// Poll a needs_review run until a workspace owner approves or denies it.
async function awaitReview(id, { tries = 40, everyMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { body } = await getRun(id);
    if (body.status !== "pending_review") return body; // approved | denied | ...
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`still pending after ${(tries * everyMs) / 1000}s`);
}

// Your own payment rail. Here it's simulated. If you broadcast a real Base
// Sepolia USDC transfer, pass TX_HASH so ZenFix can verify it on-chain.
function payOnMyRail(intent) {
  if (process.env.TX_HASH) {
    return { outcome: "executed", providerReference: process.env.TX_HASH, rail: "base-sepolia",
      transactionHash: process.env.TX_HASH, recipient: process.env.RECIPIENT };
  }
  const ref = `sim_${Math.random().toString(16).slice(2, 12)}`;
  return { outcome: "executed", providerReference: ref, rail: "base", transactionHash: `0x${ref}${ref}` };
}

// One payment, end to end: propose -> (wait for review) -> execute -> report.
async function pay(intent) {
  console.log(`\n• ${intent.purpose} — ${intent.amount} USDC to ${intent.merchant.id}`);
  const { body } = await submit(intent);
  let run = { status: body.decision?.outcome, ...body };
  console.log(`  decision: ${body.decision?.outcome}${body.decision?.reasonCodes?.length ? " (" + body.decision.reasonCodes.join(",") + ")" : ""}`);
  if (body.decision?.outcome === "blocked") { console.log("  → not paying."); return; }
  if (body.decision?.outcome === "needs_review") {
    console.log(`  → paused for review (${body.payRunId}); waiting for a human…`);
    const decided = await awaitReview(body.payRunId);
    console.log(`  review: ${decided.review?.outcome ?? decided.status}`);
    if (decided.status !== "approved") { console.log("  → not paying."); return; }
  }
  const proof = payOnMyRail(intent);
  const r = await report(body.payRunId, proof);
  if (r.http !== 200) { console.log(`  ✗ report rejected (${r.http}): ${r.body.reason ?? r.body.error}`); return; }
  console.log(`  → executed & reported. verified=${r.body.verification?.verified === true}`);
}

await pay({ agentId: "aria", purpose: "Buy the Q3 market dataset", amount: "20",
  merchant: { id: "acme_api", payee: "ACME Data", category: "api" }, artifactType: "api_result",
  idempotencyKey: `aria-${Date.now()}` });
console.log("");
