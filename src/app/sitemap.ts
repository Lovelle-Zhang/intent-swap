import type { MetadataRoute } from "next";

// The public, indexable ZenFix pages. Auth-gated /zenfix/* app routes and the
// legacy surfaces are intentionally excluded (see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://intent-swap.app";
  const now = new Date();
  return ["/", "/api-docs", "/privacy", "/terms", "/zenfix/sign-in"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
  }));
}
