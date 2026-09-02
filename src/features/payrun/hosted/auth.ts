export class InvalidEmailError extends Error {
  readonly code = "invalid_email" as const;
  constructor() { super("Enter a valid email address"); this.name = "InvalidEmailError"; }
}

export class MissingAuthCodeError extends Error {
  readonly code = "missing_auth_code" as const;
  constructor() { super("The magic link is missing its authorization code"); this.name = "MissingAuthCodeError"; }
}

export class AuthExchangeError extends Error {
  readonly code = "auth_exchange_failed" as const;
  constructor(options?: ErrorOptions) { super("The magic link could not be verified", options); this.name = "AuthExchangeError"; }
}

export interface MagicLinkSender { readonly send: (email: string, redirectTo: string) => Promise<void>; }
export interface MagicLinkExchanger { readonly exchange: (code: string) => Promise<void>; }

export function buildAuthCallbackUrl(originOrUrl: string): URL {
  const source = new URL(originOrUrl);
  return new URL("/auth/callback", source.origin);
}

export async function requestMagicLink(sender: MagicLinkSender, rawEmail: string, origin: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidEmailError();
  await sender.send(email, buildAuthCallbackUrl(origin).href);
}

export async function exchangeMagicLink(exchanger: MagicLinkExchanger, code: string | null): Promise<void> {
  if (!code) throw new MissingAuthCodeError();
  try { await exchanger.exchange(code); } catch (error) { throw new AuthExchangeError({ cause: error }); }
}
