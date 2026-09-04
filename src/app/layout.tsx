import type { Metadata } from "next";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { EnvironmentBanner } from "@/components/EnvironmentBanner";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ZenFix PayRun — Agent Payment Control Layer (Sandbox)",
  description: "Let AI agents spend money inside user-defined rules. Every payment attempt becomes an explainable, auditable Pay Run. Sandbox only — no real funds.",
  // Google Search Console site-ownership verification for intent-swap.app (public token).
  verification: { google: "jPoZyylctOR6nuyDUgGhPcJAhtS43yzhZg_oNnvFGdk" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-stone-950 text-stone-100 antialiased">
        <EnvironmentBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
