import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { InvalidEmailError, requestMagicLink } from "@/features/payrun/hosted/auth";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { checkSignInRateLimit, clientIp } from "@/features/payrun/hosted/rate-limit";

export async function POST(request: Request) {
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
  }
  // Per-IP throttle: this endpoint triggers a Supabase email send on an
  // attacker-supplied address, so it's an email-send amplifier without a limit.
  const rate = await checkSignInRateLimit(clientIp(request));
  if (!rate.ok) {
    return NextResponse.redirect(new URL("/zenfix/sign-in?status=rate_limited", appOrigin), 303);
  }
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    await requestMagicLink({
      send: async (address, redirectTo) => {
        const supabase = createSupabaseServerClient();
        const { error } = await supabase.auth.signInWithOtp({
          email: address,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
        });
        if (error) throw error;
      },
    }, email, appOrigin);
    return NextResponse.redirect(new URL("/zenfix/sign-in?status=sent", appOrigin), 303);
  } catch (error) {
    const status = error instanceof InvalidEmailError ? "invalid_email" : "auth_unavailable";
    return NextResponse.redirect(new URL(`/zenfix/sign-in?status=${status}`, appOrigin), 303);
  }
}
