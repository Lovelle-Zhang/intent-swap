import { createBrowserClient } from "@supabase/ssr";

import { AuthUnavailableError } from "../../hosted/errors";

// Browser-side Supabase client for OAuth (PKCE): it stores the code verifier in
// a cookie so /auth/callback can exchange the code in the same browser.
//
// IMPORTANT: read the NEXT_PUBLIC_* vars as *static* `process.env.X` member
// expressions. Next.js only inlines those into the browser bundle at build
// time; reading them indirectly (e.g. through the shared readSupabasePublicConfig
// helper, whose values come via a variable) leaves them undefined in the browser
// and makes signInWithOAuth fail to start.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new AuthUnavailableError("Supabase URL or publishable key is missing");
  }
  return createBrowserClient(url, publishableKey);
}
