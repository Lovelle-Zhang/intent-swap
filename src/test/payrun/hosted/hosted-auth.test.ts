import { describe, expect, test, vi } from "vitest";

import {
  AuthExchangeError,
  InvalidEmailError,
  MissingAuthCodeError,
  buildAuthCallbackUrl,
  exchangeMagicLink,
  requestMagicLink,
} from "@/features/payrun/hosted/auth";
import { AuthUnavailableError } from "@/features/payrun/hosted/errors";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";

describe("hosted email magic-link contract", () => {
  test.each(["", "not-an-email", "name@", "@example.com"])(
    "rejects invalid email %j before calling Supabase",
    async (email) => {
      const send = vi.fn();
      await expect(requestMagicLink({ send }, email, "https://zenfix.test"))
        .rejects.toBeInstanceOf(InvalidEmailError);
      expect(send).not.toHaveBeenCalled();
    },
  );

  test("uses one fixed same-origin callback and does not accept a caller redirect", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await requestMagicLink({ send }, "pilot@example.com", "https://zenfix.test");
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("pilot@example.com", "https://zenfix.test/auth/callback");
    expect(buildAuthCallbackUrl("https://zenfix.test/path?next=https://evil.test").href)
      .toBe("https://zenfix.test/auth/callback");
  });

  test("fails closed when callback code is missing or exchange fails", async () => {
    await expect(exchangeMagicLink({ exchange: vi.fn() }, null))
      .rejects.toBeInstanceOf(MissingAuthCodeError);
    await expect(exchangeMagicLink({ exchange: vi.fn().mockRejectedValue(new Error("invalid code")) }, "code"))
      .rejects.toBeInstanceOf(AuthExchangeError);
  });

  test.each([
    "ftp://zenfix.test",
    "https://user:password@zenfix.test",
  ])("rejects unsafe configured app origin %s", (value) => {
    expect(() => readZenFixAppOrigin({ ...process.env, ZENFIX_APP_ORIGIN: value }))
      .toThrow(AuthUnavailableError);
  });
});
