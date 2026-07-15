import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const seam = vi.hoisted(() => ({
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
  adapter: undefined as undefined | {
    getAll(): unknown[];
    setAll(values: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void;
  },
}));

vi.mock("next/headers", () => ({ cookies: () => seam.cookieStore }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: typeof seam.adapter }) => {
    seam.adapter = options.cookies;
    return {
      auth: {
        exchangeCodeForSession: async () => {
          options.cookies?.setAll([{ name: "sb-auth", value: "session", options: { httpOnly: true } }]);
          return { error: null };
        },
        signOut: async () => {
          options.cookies?.setAll([{ name: "sb-auth", value: "", options: { maxAge: 0 } }]);
          return { error: null };
        },
      },
    };
  },
}));

import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";

describe("Supabase server cookie adapter", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sandbox.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    seam.cookieStore.getAll.mockReset().mockReturnValue([{ name: "incoming", value: "cookie" }]);
    seam.cookieStore.set.mockReset();
    seam.adapter = undefined;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  test("reads request cookies and writes response cookies through getAll/setAll", async () => {
    const client = createSupabaseServerClient();
    expect(seam.adapter?.getAll()).toEqual([{ name: "incoming", value: "cookie" }]);
    await client.auth.exchangeCodeForSession("code");
    expect(seam.cookieStore.set).toHaveBeenCalledWith("sb-auth", "session", { httpOnly: true });
  });

  test("local sign-out cookie clearing remains observable through the adapter", async () => {
    const client = createSupabaseServerClient();
    await client.auth.signOut({ scope: "local" });
    expect(seam.cookieStore.set).toHaveBeenCalledWith("sb-auth", "", { maxAge: 0 });
  });
});
