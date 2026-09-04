import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { EnvironmentBanner } from "@/components/EnvironmentBanner";
import { Providers } from "./providers";

const zfDisplay = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display", display: "swap" });
const zfBody = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const zfMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

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
      <body className={`font-sans bg-stone-950 text-stone-100 antialiased ${zfDisplay.variable} ${zfBody.variable} ${zfMono.variable}`}>
        <EnvironmentBanner />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
