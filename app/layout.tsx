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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
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
 * Absent a stored choice it stamps nothing, which leaves the CSS free to
 * follow prefers-color-scheme.
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
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
