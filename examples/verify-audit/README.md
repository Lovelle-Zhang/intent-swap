# Independently verify a ZenFix audit trail

`verify.mjs` pulls a Pay Run's hash-chained audit trail from the public API and
re-derives every hash with **no ZenFix code** — just Node's `crypto`. If any
event was altered, inserted, reordered, or dropped, a recomputed hash won't match
the stored one and it fails.

```bash
ZENFIX_KEY=zfk_live_... node verify.mjs <payRunId>
```

Each event carries `entry_hash = sha256( prev_hash + "\n" + canonical(content) )`,
chained to the previous event (a fixed genesis for the first). `canonical` is
key-sorted JSON. `verify.mjs` recomputes the whole chain and confirms every link.

## What this proves — and what it doesn't

- **Proves**: the trail ZenFix returns is internally consistent and append-locked
  — you can detect any single event that was changed, moved, or removed.
- **Doesn't (yet)**: absolute non-repudiation against an operator who rewrites the
  *entire* chain in the database. That needs the head hash anchored somewhere
  append-only (e.g. periodically posted on-chain) — on the roadmap.

The audit table is already append-only (DB trigger) and version-contiguous; the
hash chain is the layer that lets *you*, independently, re-derive and check it.
