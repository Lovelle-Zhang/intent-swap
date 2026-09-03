"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/features/payrun/adapters/supabase/client";

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  async function signInWithGoogle() {
    setGooglePending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // On success the browser is redirected to Google; only reached on error.
      if (error) setGooglePending(false);
    } catch {
      setGooglePending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={signInWithGoogle} disabled={googlePending}>
        {googlePending ? "Redirecting to Google…" : "Continue with Google"}
      </button>

      <p>or use an email magic link</p>

      <form action="/zenfix/sign-in/request" method="post" onSubmit={() => setPending(true)}>
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a magic link"}</button>
      </form>
    </div>
  );
}
