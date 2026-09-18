import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { EnvironmentBanner } from "@/components/EnvironmentBanner";

const zfDisplay = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display", display: "swap" });
const zfBody = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const zfMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

const SITE_URL = "https://intent-swap.app";
const TITLE = "ZenFix PayRun — Agent Payment Control Layer";
const DESCRIPTION =
  "Let AI agents spend money inside user-defined rules — every payment authorized against your policy and verified on-chain that it really happened. Test mode on Base Sepolia; ZenFix never holds funds or keys.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "ZenFix PayRun",
  // Google Search Console site-ownership verification for intent-swap.app (public token).
  verification: { google: "jPoZyylctOR6nuyDUgGhPcJAhtS43yzhZg_oNnvFGdk" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ZenFix PayRun",
    title: TITLE,
    description: DESCRIPTION,
    // The og image is supplied by the app/opengraph-image route (file convention).
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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
        {children}
      </body>
    </html>
  );
}
