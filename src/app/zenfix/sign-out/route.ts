import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { crossOriginRefused, isCrossOriginPost } from "@/features/payrun/hosted/origin-check";

export async function POST(request: Request) {
  if (isCrossOriginPost(request)) return crossOriginRefused();
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
  }
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    return NextResponse.redirect(new URL("/zenfix/sign-in?status=signed_out", appOrigin), 303);
  } catch {
    return NextResponse.redirect(new URL("/zenfix/sign-in?status=auth_unavailable", appOrigin), 303);
  }
}
