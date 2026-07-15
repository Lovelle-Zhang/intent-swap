export class AuthUnavailableError extends Error {
  readonly code = "auth_unavailable" as const;
  constructor(message = "ZenFix authentication is unavailable", options?: ErrorOptions) {
    super(message, options); this.name = "AuthUnavailableError";
  }
}

export class AuthenticationRequiredError extends Error {
  readonly code = "authentication_required" as const;
  constructor() { super("Sign in to continue"); this.name = "AuthenticationRequiredError"; }
}
