import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { isCrossOriginPost } from "@/features/payrun/hosted/origin-check";

const APP = "https://intent-swap.app";
const post = (headers: Record<string, string>) =>
  new Request(`${APP}/zenfix/policy`, { method: "POST", headers });

describe("isCrossOriginPost", () => {
  beforeEach(() => { process.env.ZENFIX_APP_ORIGIN = APP; });
  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("allows a same-origin form POST (Origin matches)", () => {
    expect(isCrossOriginPost(post({ origin: APP }))).toBe(false);
  });

  test("blocks a cross-site POST (Origin differs)", () => {
    expect(isCrossOriginPost(post({ origin: "https://evil.example" }))).toBe(true);
  });

  test("falls back to Referer when Origin is absent", () => {
    expect(isCrossOriginPost(post({ referer: `${APP}/zenfix/policy` }))).toBe(false);
    expect(isCrossOriginPost(post({ referer: "https://evil.example/x" }))).toBe(true);
    expect(isCrossOriginPost(post({ referer: "not a url" }))).toBe(true);
  });

  test("allows when neither Origin nor Referer is present (non-browser client, no ambient cookie)", () => {
    expect(isCrossOriginPost(post({}))).toBe(false);
  });

  test("does not block when the app origin is unconfigured", () => {
    delete process.env.ZENFIX_APP_ORIGIN;
    expect(isCrossOriginPost(post({ origin: "https://evil.example" }))).toBe(false);
  });
});
