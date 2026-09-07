import { describe, expect, test } from "vitest";

import { GET } from "@/app/api-docs/route";
import { renderDocsPage } from "@/features/payrun/hosted/docs";

describe("public API docs page", () => {
  test("GET /docs returns a cacheable HTML reference", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("public");
    const html = await res.text();
    expect(html).toContain("API Reference");
  });

  test("documents both endpoints, auth, policy, and status codes", () => {
    const html = renderDocsPage();
    expect(html).toContain("/api/v1/payruns");
    expect(html).toContain("/api/v1/payruns/{payRunId}/execution");
    expect(html).toContain("Authorization: Bearer zfk_live_");
    expect(html).toContain("execution_reported");
    // decision outcomes + a couple of status codes
    for (const token of ["allowed", "needs_review", "blocked", "401", "409"]) {
      expect(html).toContain(token);
    }
    // links back into the product
    expect(html).toContain('href="/zenfix/policy"');
    expect(html).toContain('href="/zenfix/keys"');
  });

  test("has a quickstart and per-language snippets (curl / Python / JS)", () => {
    const html = renderDocsPage();
    expect(html).toContain("Quickstart");
    for (const lang of ["curl", "Python", "JavaScript"]) expect(html).toContain(`>${lang}</p>`);
    expect(html).toContain("import requests");
    expect(html).toContain("await fetch("); // JS snippet present (quotes are HTML-escaped in code blocks)
    expect(html).toContain("JSON.stringify({");
  });
});
