import type { Metadata } from "next";
import Link from "next/link";
import { EB_Garamond, Inter, Geist_Mono } from "next/font/google";
import { Layers3 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const heading = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "ENS402 | Discover. Govern. Guard.",
  description:
    "Public x402 service configuration on ENS, native EAC governance and SDK payment verification. Independent indexing in development. Testnet prototype.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${heading.variable} ${mono.variable}`}
    >
      <body className="flex min-h-screen flex-col antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:p-3 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-primary/15 bg-background/95 shadow-sm backdrop-blur-md">
          <div className="section-shell flex min-h-18 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
            <Link
              href="/"
              aria-label="ENS402 home"
              className="flex items-center justify-self-start gap-2.5 text-xl font-semibold tracking-tight"
            >
              <Layers3 className="size-6 text-primary" aria-hidden="true" />
              ENS<span className="-ml-2 text-primary">402</span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <footer className="mt-12 border-t border-primary/20 bg-[#eaf1f1]">
          <div className="section-shell grid gap-8 py-10 sm:grid-cols-[1fr_auto] sm:py-12">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight"
              >
                <Layers3 className="size-6 text-primary" aria-hidden="true" />
                ENS402
              </Link>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                Discover services. Govern their configuration.
                <br />
                Verify before you pay.
              </p>
            </div>
            <nav
              aria-label="Footer navigation"
              className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm font-medium"
            >
              <Link href="/console" className="hover:text-primary">
                Search services
              </Link>
              <Link href="/docs" className="hover:text-primary">
                Developer docs
              </Link>
              <Link href="/provider" className="hover:text-primary">
                Onboard your service
              </Link>
              <Link href="/#architecture" className="hover:text-primary">
                How it works
              </Link>
            </nav>
          </div>
          <div className="section-shell flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 py-5 text-xs text-muted-foreground">
            <p>Independent project · ETHGlobal Tokyo 2026</p>
            <p className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              Testnet demo · ENS Sepolia / Base Sepolia
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
