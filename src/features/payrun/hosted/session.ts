import { AuthenticationRequiredError, AuthUnavailableError } from "./errors";

export interface SupabaseUserSource {
  readonly getUser: () => Promise<{ readonly data: { readonly user: { readonly id: string } | null }; readonly error: Error | null }>;
}

export async function requireVerifiedIdentity(source: SupabaseUserSource) {
  let result;
  try { result = await source.getUser(); } catch (error) {
    throw new AuthUnavailableError("Supabase could not verify the session", { cause: error });
  }
  if (result.error) throw new AuthUnavailableError("Supabase could not verify the session", { cause: result.error });
  if (!result.data.user) throw new AuthenticationRequiredError();
  return { userId: result.data.user.id };
}
