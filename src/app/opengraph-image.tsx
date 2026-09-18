import { ImageResponse } from "next/og";

// Generated social-share card for link previews (Slack/iMessage/Twitter/LinkedIn).
// Plain layout, default font — no external assets — so it renders reliably.
export const alt = "ZenFix PayRun — Agent Payment Control Layer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0A0C0F",
          padding: 72,
          color: "#EBEDEF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 46,
              height: 46,
              borderRadius: 13,
              background: "#161A20",
              border: "2px solid #232A33",
            }}
          />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>ZenFix PayRun</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 700 }}>Your agents are spending.</div>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 700, color: "#2DD4BF" }}>Prove every payment.</div>
          <div style={{ display: "flex", fontSize: 26, color: "#8A929C", marginTop: 26, maxWidth: 940 }}>
            Every agent payment is authorized against your policy, then verified on-chain that it really happened. Test mode on Base Sepolia.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#5A626C", fontFamily: "monospace" }}>intent-swap.app</div>
      </div>
    ),
    { ...size },
  );
}
