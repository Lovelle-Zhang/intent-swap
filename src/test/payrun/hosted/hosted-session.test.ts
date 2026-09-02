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

  test("anonymous and auth provider failure fail closed", async () => {
    await expect(requireVerifiedIdentity({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    })).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(requireVerifiedIdentity({
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("offline") }),
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
