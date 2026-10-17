import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";

// Both families are self-hosted variable fonts. No Google Fonts request is made
// at build time or in the browser.
const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "BeatFlow Studio",
    template: "%s · BeatFlow",
  },
  description: "Render, schedule, and publish YouTube-ready beat videos from the browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-surface-container-lowest font-sans text-on-surface antialiased">
        {children}
      </body>
    </html>
  );
}
