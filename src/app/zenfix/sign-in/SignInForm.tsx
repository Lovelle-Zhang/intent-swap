"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/features/payrun/adapters/supabase/client";

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // On success the browser is redirected to Google; only reached on error.
      if (oauthError) {
        setError("Could not start Google sign-in. Please try again.");
        setPending(false);
      }
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className="flex w-full items-center justify-center rounded-md bg-white px-4 py-2.5 font-medium text-stone-900 transition-colors hover:bg-stone-100 disabled:opacity-60"
      >
        {pending ? "Redirecting to Google…" : "Continue with Google"}
      </button>
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
