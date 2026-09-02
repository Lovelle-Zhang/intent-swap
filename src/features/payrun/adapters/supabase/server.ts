import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readSupabasePublicConfig } from "../../hosted/config";

export function createSupabaseServerClient() {
  const config = readSupabasePublicConfig();
  const cookieStore = cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; the scoped middleware refreshes them.
        }
      },
    },
  });
}
