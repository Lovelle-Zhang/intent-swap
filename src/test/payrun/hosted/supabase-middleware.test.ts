import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const adapter = vi.hoisted(() => ({ value: undefined as undefined | {
  setAll(values: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void;
} }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: typeof adapter.value }) => {
    adapter.value = options.cookies;
    return { auth: { getUser } };
  },
}));

import { refreshZenFixSession } from "@/features/payrun/adapters/supabase/middleware";

describe("scoped Supabase middleware", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    getUser.mockReset();
    adapter.value = undefined;
  });

  test("auth network outage abandons refresh and leaves the route handler reachable", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sandbox.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    getUser.mockRejectedValue(new Error("network unavailable"));
    const response = await refreshZenFixSession(new NextRequest("https://zenfix.test/zenfix/sign-in"));
    expect(response.status).toBe(200);
    expect(getUser).toHaveBeenCalledOnce();
  });

  test("refresh cookie writes are synchronized to the request and response", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sandbox.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    getUser.mockImplementation(async () => {
      adapter.value?.setAll([{ name: "sb-auth", value: "refreshed", options: { httpOnly: true } }]);
      return { data: { user: { id: "user" } }, error: null };
    });
    const request = new NextRequest("https://zenfix.test/zenfix/workspace");
    const response = await refreshZenFixSession(request);
    expect(request.cookies.get("sb-auth")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-auth")?.value).toBe("refreshed");
  });
});
