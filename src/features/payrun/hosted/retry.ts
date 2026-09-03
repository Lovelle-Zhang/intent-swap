import { PersistenceUnavailableError } from "../adapters/storage";
import { AuthUnavailableError } from "./errors";

// Read-only hosted surfaces (Personal Workspace, Pay Runs) fail closed with a
// 503 when a transient infra hiccup occurs mid-request — either Supabase Auth's
// getUser() network check or a lost Postgres connection. Both are idempotent
// reads, so retry the whole load exactly once before surfacing unavailability.
// AuthenticationRequiredError (genuinely signed out) is not transient and is not
// caught here, so it still redirects to sign-in.
export async function retryOnTransientUnavailable<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
      console.warn(`[zenfix] transient ${error.name}; retrying once`);
      return await operation();
    }
    throw error;
  }
}
