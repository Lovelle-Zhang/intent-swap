import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";

describe("hosted server session boundary", () => {
  test("uses only the server-verified Supabase user", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
    await expect(requireVerifiedIdentity({ getUser })).resolves.toEqual({ userId: "verified-user" });
    expect(getUser).toHaveBeenCalledOnce();
  });

  test("a missing / invalid session is 'not signed in' (redirect), never a 503", async () => {
    // No user, no error → plainly anonymous.
    await expect(requireVerifiedIdentity({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    })).rejects.toBeInstanceOf(AuthenticationRequiredError);
    // supabase-js returns an AuthSessionMissingError (no user, non-5xx) when there is
    // no session — that is "not signed in", so it must redirect to sign-in, NOT 503.
    // (Regression guard: treating this as AuthUnavailableError made /zenfix dead-end
    // in a 503 for every logged-out visitor.)
    await expect(requireVerifiedIdentity({
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: Object.assign(new Error("Auth session missing!"), { status: 400 }),
      }),
    })).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  test("a genuine auth-service failure fails closed as unavailable (503)", async () => {
    // getUser() throwing (transport failure) → unavailable.
    await expect(requireVerifiedIdentity({
      getUser: vi.fn().mockRejectedValue(new Error("network down")),
    })).rejects.toBeInstanceOf(AuthUnavailableError);
    // The auth API responding with a 5xx (no user) → unavailable, not a login redirect.
    await expect(requireVerifiedIdentity({
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: Object.assign(new Error("bad gateway"), { status: 502 }),
      }),
    })).rejects.toBeInstanceOf(AuthUnavailableError);
  });

  test("auth refresh is scoped to ZenFix and legacy routes remain untouched", async () => {
    const middleware = await readFile(new URL("../../../middleware.ts", import.meta.url), "utf8");
    expect(middleware).toContain('matcher: ["/zenfix/:path*"]');
    expect(middleware).not.toMatch(/execute|monitor|wallet/);
  });

  test("workspace authorization ignores request project and owner identifiers", async () => {
    const route = await readFile(new URL("../../../app/zenfix/workspace/route.ts", import.meta.url), "utf8");
    expect(route).not.toMatch(/searchParams|get\("projectId"\)|get\("ownerUserId"\)/);
    expect(route).toContain("requireVerifiedIdentity");
  });
});
