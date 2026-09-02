import { AuthUnavailableError } from "./errors";

export interface SupabasePublicConfig { readonly url: string; readonly publishableKey: string; }

export function readSupabasePublicConfig(env: NodeJS.ProcessEnv = process.env): SupabasePublicConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new AuthUnavailableError("Supabase URL or publishable key is missing");
  return { url, publishableKey };
}

export function readZenFixAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.ZENFIX_APP_ORIGIN;
  if (!value) throw new AuthUnavailableError("ZENFIX_APP_ORIGIN is missing");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new AuthUnavailableError("ZENFIX_APP_ORIGIN must be an HTTP(S) origin without credentials or a path");
  }
  return url.origin;
}
