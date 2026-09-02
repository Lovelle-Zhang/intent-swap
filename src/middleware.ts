import type { NextRequest } from "next/server";

import { refreshZenFixSession } from "@/features/payrun/adapters/supabase/middleware";

export function middleware(request: NextRequest) {
  return refreshZenFixSession(request);
}

export const config = { matcher: ["/zenfix/:path*"] };
