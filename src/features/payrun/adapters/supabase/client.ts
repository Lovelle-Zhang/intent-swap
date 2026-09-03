import { createBrowserClient } from "@supabase/ssr";

import { readSupabasePublicConfig } from "../../hosted/config";

// Browser-side Supabase client for OAuth (PKCE): it stores the code verifier in
// a cookie so /auth/callback can exchange the code in the same browser. Uses the
// same public config as the server client.
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = readSupabasePublicConfig();
  return createBrowserClient(url, publishableKey);
}
