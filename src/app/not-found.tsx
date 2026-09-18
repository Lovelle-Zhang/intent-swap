import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Not found — ZenFix PayRun" };

// Branded 404 so an unmatched route (or a removed legacy path) lands on a way back
// in, not Next's default black-on-white page. Self-contained inline styles so it
// never depends on a page-specific stylesheet.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
        padding: "10vh 24px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#EBEDEF",
      }}
    >
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.18em", color: "#2DD4BF" }}>
        404 · NOT FOUND
      </span>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>This page doesn&rsquo;t exist.</h1>
      <p style={{ margin: 0, color: "#8A929C", fontSize: 15, maxWidth: 440 }}>
        The link may be old or mistyped. ZenFix is the agent payment control layer — head back and start from the top.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          display: "inline-block",
          background: "#2DD4BF",
          color: "#04201C",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 14,
          padding: "11px 20px",
          borderRadius: 10,
        }}
      >
        Back to ZenFix →
      </Link>
    </main>
  );
}
