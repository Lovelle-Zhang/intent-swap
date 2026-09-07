import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { SqlPool } from "../adapters/storage/postgres/sql";
import { withHostedTransaction } from "../adapters/storage/postgres/transaction";
import type { VerifiedAuthIdentity } from "./workspace";

// 2B-intake auth: per-workspace bearer keys. Only the SHA-256 hash is stored;
// the plaintext `zfk_live_…` is shown once at creation. Owners manage their own
// keys under zenfix_app RLS; inbound auth resolves a hash to its owner via the
// SECURITY DEFINER function (no tenant context needed).

const KEY_PREFIX = "zfk_live_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isWellFormedApiKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(KEY_PREFIX) && key.length >= KEY_PREFIX.length + 24;
}

function mintApiKey(): { key: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  return { key, hash: hashApiKey(key), prefix: `${KEY_PREFIX}${secret.slice(0, 6)}` };
}

export interface ApiKeyView {
  readonly id: string;
  readonly prefix: string;
  readonly label: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

interface ApiKeyRow extends Record<string, unknown> {
  readonly id: string;
  readonly prefix: string;
  readonly label: string;
  readonly created_at: string;
  readonly last_used_at: string | null;
  readonly revoked_at: string | null;
}

function toView(row: ApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    prefix: row.prefix,
    label: row.label,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}

export async function listWorkspaceApiKeys(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<ApiKeyView[]> {
  return withHostedTransaction({ pool, userId: identity.userId }, async (client) => {
    const res = await client.query<ApiKeyRow>(
      `SELECT id, prefix, label, created_at, last_used_at, revoked_at
       FROM public.api_keys WHERE owner_user_id = $1::uuid
       ORDER BY created_at DESC`,
      [identity.userId],
    );
    return res.rows.map(toView);
  });
}

export interface CreatedApiKey {
  readonly key: string; // plaintext — returned once, never stored
  readonly view: ApiKeyView;
}

export async function createWorkspaceApiKey(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  label: string,
): Promise<CreatedApiKey> {
  const minted = mintApiKey();
  const id = randomUUID();
  const trimmed = label.trim().slice(0, 80);
  return withHostedTransaction({ pool, userId: identity.userId }, async (client) => {
    const res = await client.query<ApiKeyRow>(
      `INSERT INTO public.api_keys (id, owner_user_id, key_hash, prefix, label)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)
       RETURNING id, prefix, label, created_at, last_used_at, revoked_at`,
      [id, identity.userId, minted.hash, minted.prefix, trimmed],
    );
    return { key: minted.key, view: toView(res.rows[0]) };
  });
}

export async function revokeWorkspaceApiKey(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
  id: string,
): Promise<boolean> {
  return withHostedTransaction({ pool, userId: identity.userId }, async (client) => {
    const res = await client.query(
      `UPDATE public.api_keys SET revoked_at = transaction_timestamp()
       WHERE id = $1::uuid AND owner_user_id = $2::uuid AND revoked_at IS NULL`,
      [id, identity.userId],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

// Inbound auth: resolve a presented bearer key to its owner identity, or null
// (malformed / unknown / revoked). Runs a single scoped resolver call outside
// the guarded workspace transaction, since no tenant context exists yet.
export async function resolveApiKeyIdentity(
  pool: SqlPool,
  presentedKey: unknown,
): Promise<VerifiedAuthIdentity | null> {
  if (!isWellFormedApiKey(presentedKey)) return null;
  const hash = hashApiKey(presentedKey);
  const client = await pool.connect();
  try {
    const res = await client.query<{ uid: string | null }>(
      "SELECT public.zenfix_resolve_api_key($1) AS uid",
      [hash],
    );
    const uid = res.rows[0]?.uid ?? null;
    return uid ? { userId: uid } : null;
  } finally {
    client.release();
  }
}
