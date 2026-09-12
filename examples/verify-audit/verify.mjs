// Independently verify a ZenFix Pay Run's audit trail — no ZenFix code, just its
// public JSON. Fetches the hash-chained audit and re-derives every hash:
//   entry_hash = sha256( prev_hash + "\n" + canonical(event content) )
// If any event was altered, inserted, or reordered, a recomputed hash won't
// match the stored one and this fails loudly.
//   ZENFIX_KEY=zfk_live_... node verify.mjs <payRunId>

import { createHash } from "node:crypto";

const BASE = process.env.ZENFIX_BASE ?? "https://intent-swap.app";
const KEY = process.env.ZENFIX_KEY;
const ID = process.argv[2];
if (!KEY || !ID) { console.error("Usage: ZENFIX_KEY=zfk_live_... node verify.mjs <payRunId>"); process.exit(1); }

// Canonical JSON: sort object keys by Unicode code point, recurse, then stringify
// (matches ZenFix's canonicalStringify). Field names are ASCII, but we sort by
// code point to be exact for arbitrary `details`.
function codePoints(s) { return Array.from(s, (c) => c.codePointAt(0)); }
function cmp(a, b) {
  const x = codePoints(a), y = codePoints(b), n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
function canon(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canon);
  const out = {};
  for (const k of Object.keys(v).sort(cmp)) out[k] = canon(v[k]);
  return out;
}
const canonicalStringify = (v) => JSON.stringify(canon(v));

// The exact preimage content ZenFix hashes (must mirror auditEntryContent).
function content(e) {
  return {
    id: e.id, projectId: e.projectId, payRunId: e.payRunId,
    aggregateType: e.aggregateType, aggregateId: e.aggregateId, sequence: e.sequence,
    beforeVersion: e.beforeVersion, afterVersion: e.afterVersion,
    actor: { actorId: e.actor.actorId, actorType: e.actor.actorType },
    actionCode: e.actionCode, reasonCode: e.reasonCode, idempotencyKey: e.idempotencyKey,
    correlationId: e.correlationId, occurredAt: new Date(e.occurredAt).toISOString(), details: e.details,
  };
}
const entryHash = (prev, e) => createHash("sha256").update(`${prev}\n${canonicalStringify(content(e))}`, "utf8").digest("hex");

const res = await fetch(`${BASE}/api/v1/payruns/${ID}/audit`, { headers: { Authorization: `Bearer ${KEY}` } });
if (!res.ok) { console.error(`HTTP ${res.status}: ${(await res.json()).error ?? ""}`); process.exit(1); }
const chain = await res.json();

let prev = chain.genesis;
for (let i = 0; i < chain.events.length; i++) {
  const e = chain.events[i];
  const recomputed = entryHash(prev, e);
  if (e.prevHash !== prev || recomputed !== e.entryHash) {
    console.error(`✗ TAMPERED at event #${i} (${e.actionCode}). prev/hash link broken.`);
    process.exit(2);
  }
  prev = e.entryHash;
}
console.log(`✓ verified — ${chain.events.length} audit events form an unbroken chain. head=${chain.headHash?.slice(0, 12)}…`);
