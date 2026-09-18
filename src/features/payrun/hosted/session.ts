import { AuthenticationRequiredError, AuthUnavailableError } from "./errors";

export interface SupabaseUserSource {
  readonly getUser: () => Promise<{
    readonly data: { readonly user: { readonly id: string } | null };
    readonly error: (Error & { readonly status?: number }) | null;
  }>;
}

export async function requireVerifiedIdentity(source: SupabaseUserSource) {
  let result;
  try {
    result = await source.getUser();
  } catch (error) {
    // getUser() threw — a transport/unknown failure, not a verdict about the user.
    throw new AuthUnavailableError("Supabase could not verify the session", { cause: error });
  }
  if (result.data.user) return { userId: result.data.user.id };
  // No verified user. supabase-js reports a missing / expired / invalid session as
  // an error here (e.g. AuthSessionMissingError) — that means "not signed in", and
  // must send the visitor to sign-in, NOT a 503. (Checking result.error first, as
  // this used to, turned every anonymous request into an AuthUnavailableError, so
  // /zenfix → /zenfix/workspace dead-ended in 503 instead of redirecting to login.)
  // Reserve AuthUnavailableError for a genuine auth-service failure: getUser()
  // throwing (above), or the auth API responding with a 5xx.
  if (result.error && (result.error.status ?? 0) >= 500) {
    throw new AuthUnavailableError("Supabase auth service failed", { cause: result.error });
  }
  throw new AuthenticationRequiredError();
}
