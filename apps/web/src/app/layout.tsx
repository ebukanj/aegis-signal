import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/lib/providers";
import { siteConfig } from "@/config/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — Crypto Market Intelligence`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

/**
 * Ignore errors thrown by BROWSER EXTENSIONS, not by this app.
 *
 * A user's extensions (a geo-spoofer, a wallet, an ad-blocker) run content scripts
 * in the page and sometimes throw — e.g. "Verification timed out" from a VPN
 * extension's `chrome-extension://…/csSpoofGeoMain.bundle.js`. Next.js's dev error
 * overlay catches every uncaught window error, including those, and shows them as
 * if they were ours — alarming, and not actionable, because the fault is in code we
 * do not ship.
 *
 * This runs in <head>, before the overlay attaches its own listeners, and swallows
 * (only) errors whose origin is an extension URL. It cannot hide a real app error —
 * our code never lives at a `chrome-extension://` or `moz-extension://` path.
 */
const EXTENSION_ERROR_GUARD = `
(function () {
  function fromExtension(text) {
    return typeof text === "string" &&
      (text.indexOf("chrome-extension://") !== -1 || text.indexOf("moz-extension://") !== -1);
  }
  window.addEventListener("error", function (e) {
    var src = (e && e.filename) || (e && e.error && e.error.stack) || "";
    if (fromExtension(src)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var src = (reason && (reason.stack || reason.message)) || String(reason || "");
    if (fromExtension(src)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before hydration so extension errors never reach the dev overlay. */}
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_ERROR_GUARD }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
