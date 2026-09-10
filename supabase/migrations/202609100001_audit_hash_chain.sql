-- Tamper-evident audit: hash-chain each audit event. entry_hash =
-- sha256(prev_hash + "\n" + canonical(event)); prev_hash is the previous event's
-- entry_hash for that Pay Run (a fixed genesis for the first). The table is
-- already append-only (trigger) + contiguous + lineage-unique; the chain lets
-- anyone re-derive it and detect any altered / inserted / reordered event.
-- Nullable so pre-existing rows (written before this migration) stay valid;
-- every new row is chained.
ALTER TABLE public.audit_events
  ADD COLUMN prev_hash text,
  ADD COLUMN entry_hash text;
