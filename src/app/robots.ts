import type { MetadataRoute } from "next";

// Index the real public ZenFix pages; keep the auth-gated app, the API, and the
// dev sandbox out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api-docs", "/privacy", "/terms", "/zenfix/sign-in"],
        disallow: [
          "/api/",
          "/auth/",
          "/zenfix/", // auth-gated app; /zenfix/sign-in stays allowed via the longer match above
          "/sandbox",
        ],
      },
    ],
    sitemap: "https://intent-swap.app/sitemap.xml",
  };
}
