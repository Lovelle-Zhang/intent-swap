import type { SqlPool } from "../adapters/storage/postgres/sql";
import type { VerifiedAuthIdentity } from "./workspace";

// Resolve a workspace owner's email for the owner-facing verified-payment
// notification. The execution/report path is authenticated by API key and has
// no browser session, so the email isn't in context — this reads it via the
// SECURITY DEFINER lookup (202609170001), the same RLS-exempt, zenfix_app-only
// pattern as the API-key resolver. Returns null when unknown; the caller treats
// a missing address as "don't send" and never fails on it.
export async function resolveOwnerEmail(
  pool: SqlPool,
  identity: VerifiedAuthIdentity,
): Promise<string | null> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ email: string | null }>(
      "SELECT public.zenfix_owner_email($1::uuid) AS email",
      [identity.userId],
    );
    const email = res.rows[0]?.email ?? null;
    return email && email.includes("@") ? email : null;
  } finally {
    client.release();
  }
}
