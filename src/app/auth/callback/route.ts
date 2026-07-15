import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { exchangeMagicLink } from "@/features/payrun/hosted/auth";
import { AuthUnavailableError } from "@/features/payrun/hosted/errors";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
  }
  try {
    const supabase = createSupabaseServerClient();
    await exchangeMagicLink({
      exchange: async (code) => {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      },
    }, url.searchParams.get("code"));
    return NextResponse.redirect(new URL("/zenfix/workspace", appOrigin), 303);
  } catch (error) {
    const status = error instanceof AuthUnavailableError ? "auth_unavailable" : "expired_link";
    return NextResponse.redirect(new URL(`/zenfix/sign-in?status=${status}`, appOrigin), 303);
  }
}
