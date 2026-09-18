import { readZenFixAppOrigin } from "./config";

// Defense-in-depth against CSRF on the cookie-authenticated browser POSTs (policy
// save, API-key create/revoke, review approve/deny, sign-out, sandbox create). A
// same-origin form submit carries an Origin header equal to our app origin; a
// cross-site POST carries a different Origin. We refuse when an Origin (or, failing
// that, a Referer) is present and does NOT match the configured app origin.
//
// The Supabase session cookie is SameSite=Lax, so cross-site form POSTs are already
// blocked by the browser; this closes the gap if that ever changes and makes the
// intent explicit. A request with NEITHER header (e.g. a non-browser client, which
// has no ambient cookie anyway) is allowed — the check targets the browser-CSRF
// vector, where the Origin header is always sent on a cross-origin POST.
export function isCrossOriginPost(request: Request): boolean {
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return false; // origin unknown (config error surfaces elsewhere) — don't block
  }
  const origin = request.headers.get("origin");
  if (origin) return origin !== appOrigin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin !== appOrigin;
    } catch {
      return true; // a malformed Referer is treated as cross-origin
    }
  }
  return false;
}

// Standard refusal for a cross-origin state-changing POST.
export function crossOriginRefused(): Response {
  return new Response("Cross-origin request refused.", { status: 403 });
}
