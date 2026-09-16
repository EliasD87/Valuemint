import type { Metadata } from "next";

/**
 * Keep this page out of search indexes.
 *
 * Nothing here is secret — a Safe's owners and every approval are public on
 * chain — but an indexed page on the project's own domain that names the wallets
 * controlling it is a gift to anyone writing a phishing message. Being hard to
 * find is not security; not being advertised still costs an attacker something.
 */
export const metadata: Metadata = {
  title: "Approve",
  robots: { index: false, follow: false, nocache: true },
};

export default function SafeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
