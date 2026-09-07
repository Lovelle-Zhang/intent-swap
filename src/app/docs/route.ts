import { renderDocsPage } from "@/features/payrun/hosted/docs";

// Public, unauthenticated API reference. Static content, cacheable.
export const dynamic = "force-static";
export const runtime = "nodejs";

export function GET(): Response {
  return new Response(renderDocsPage(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
