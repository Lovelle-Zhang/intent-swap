import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Intent Swap",
  description: "Swap with intention. Not just tokens.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-stone-950 text-stone-100 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
