import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";
import { Layout } from "@/components/Layout";
import "@/styles/global.css";

/**
 * Type.
 *
 * Bricolage Grotesque for display - a variable grotesque with real character in
 * its wider optical sizes, so headings carry the brand rather than reading as
 * stock UI. Geist for everything else: neutral, excellent at small sizes, and
 * it stays out of the artwork's way.
 *
 * Self-hosted through next/font, so there is no request to a font CDN, no
 * layout shift, and no flash of a fallback face.
 */

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // Without this, any relative asset in a link preview stays relative and most
  // scrapers drop it.
  metadataBase: new URL("https://www.valuemint.store"),
  title: {
    default: "ValueMint — NFT Marketplace on ValueChain",
    template: "%s · ValueMint",
  },
  description:
    "Create, mint, collect and trade NFTs on ValueChain — SoSoValue's Layer 1. Non-custodial, settling in seconds.",
  openGraph: {
    title: "ValueMint — NFT Marketplace on ValueChain",
    description: "Create, mint, collect and trade NFTs on ValueChain.",
    url: "https://www.valuemint.store",
    siteName: "ValueMint",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ValueMint — NFT Marketplace on ValueChain",
    description: "Create, mint, collect and trade NFTs on ValueChain.",
  },
};

export const viewport: Viewport = {
  // Light is the site's default for everyone, so the browser chrome matches the
  // page a first-time visitor actually gets rather than their OS setting.
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

/**
 * Resolve the theme before the first paint.
 *
 * This has to run as a blocking inline script in <head>. React cannot do it:
 * the markup is server-rendered, so by the time any component reads
 * localStorage the browser has already painted the default theme, and a viewer
 * who chose dark gets a full-screen white flash on every navigation.
 *
 * Absent a stored choice it stamps nothing, and nothing is now the same as
 * light: the OS-following media queries were removed, so the bare `:root`
 * palette in tokens.css is what an unstamped document gets. Only a viewer who
 * picked dark carries `data-theme="dark"`, and only they need this script to
 * avoid a white flash.
 */
const noFlash = `
try {
  var t = localStorage.getItem("valuemint-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        {/**
         * A raw <script>, and it has to stay one.
         *
         * React 19 warns about this in development: "Scripts inside React
         * components are never executed when rendering on the client." That is
         * true and harmless here - the tag is serialised by the server, the
         * browser runs it on the initial load, and it never needs to run again.
         * The warning does not appear in a production build.
         *
         * `next/script` with `strategy="beforeInteractive"` is the documented
         * replacement and was tried: in this setup (Next 16, Turbopack, an
         * explicit <head> in the root layout) it fails to resolve during the
         * server render and throws `ReferenceError: Script is not defined` on
         * every request. Verified with a cleared Turbopack cache, so a dev-only
         * warning became a real error. Not worth it.
         */}
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
        {/**
         * Vercel Analytics.
         *
         * Switching it on in the Vercel dashboard does nothing by itself: on the
         * App Router the dashboard toggle only starts *accepting* events, and
         * this component is what sends them. Without it the project shows as
         * enabled and reports no traffic forever.
         *
         * Outside `<Providers>` deliberately — it needs nothing from wagmi or
         * React Query, and it should not be inside a tree that suspends.
         *
         * The script loads from `va.vercel-scripts.com`, not from our own
         * origin - this comment used to claim otherwise, and that was wrong in
         * a way that cost real data. When `script-src` was tightened to
         * `'self'`, the request was refused and the only sign was one console
         * line on the visitor's machine; the dashboard just stayed empty, which
         * reads as "not set up yet" rather than "blocked". That host is now
         * named in the CSP in next.config.ts and must stay there.
         *
         * The beacons it sends do go to `/_vercel/insights` on our own origin,
         * which `connect-src 'self'` already covers.
         *
         * It reports page views only: no wallet address, no cookie, nothing
         * about what anyone holds.
         */}
        <Analytics />
      </body>
    </html>
  );
}
