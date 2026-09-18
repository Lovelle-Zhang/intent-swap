"use client";

import Link from "next/link";
import { useEffect } from "react";

// Branded, self-contained error boundary so an unexpected render error shows a
// recoverable page (Try again / Back home) instead of Next's default one.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[zenfix] unhandled error", error);
  }, [error]);

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
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.18em", color: "#F2777A" }}>
        SOMETHING WENT WRONG
      </span>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>This page hit an unexpected error.</h1>
      <p style={{ margin: 0, color: "#8A929C", fontSize: 15, maxWidth: 440 }}>
        It&rsquo;s not you. Try again, and if it keeps happening, head back to the start.
      </p>
      <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
        <button
          onClick={() => reset()}
          style={{
            background: "#2DD4BF",
            color: "#04201C",
            border: "none",
            fontWeight: 600,
            fontSize: 14,
            padding: "11px 20px",
            borderRadius: 10,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            background: "transparent",
            color: "#8A929C",
            border: "1px solid #232A33",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: 14,
            padding: "11px 20px",
            borderRadius: 10,
          }}
        >
          Back to ZenFix
        </Link>
      </div>
    </main>
  );
}
