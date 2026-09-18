import type { MetadataRoute } from "next";

// Index the real ZenFix product pages; keep auth-gated routes and the parked
// legacy Intent-Swap surfaces (DEX docs/swap, the moderated-study pilot cluster,
// and other pre-ZenFix pages) out of search results.
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
          "/swap",
          "/docs",
          "/pilot-validation",
          "/command-center",
          "/payruns",
          "/conditional-order",
          "/execute",
          "/orders",
          "/portfolio",
          "/history",
          "/activity",
          "/subscribe",
          "/preview",
          "/sandbox",
          "/landing",
        ],
      },
    ],
    sitemap: "https://intent-swap.app/sitemap.xml",
  };
}
