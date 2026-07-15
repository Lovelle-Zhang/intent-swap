import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { readSupabasePublicConfig } from "../../hosted/config";

export async function refreshZenFixSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let config;
  try {
    config = readSupabasePublicConfig();
  } catch {
    // Keep the recovery/sign-in page reachable. Protected handlers still fail
    // closed when they perform authoritative server verification.
    return response;
  }
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // Auth refresh is best effort here so recovery routes remain reachable.
    // Protected handlers still call getUser authoritatively and fail closed.
  }
  return response;
}
