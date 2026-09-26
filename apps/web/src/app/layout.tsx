import type { Metadata } from 'next';
import Link from 'next/link';
import { EB_Garamond, Inter, Geist_Mono } from 'next/font/google';
import { ArrowUpRight, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const heading = EB_Garamond({ subsets: ['latin'], variable: '--font-editorial', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'ENS402 | Discover. Govern. Guard.',
  description: 'Public x402 service configuration on ENS, native EAC governance and SDK payment verification. Independent discovery and published pricing in development. Testnet prototype.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${sans.variable} ${heading.variable} ${mono.variable}`}><body className="min-h-screen antialiased">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:p-3 focus:text-primary-foreground">Skip to content</a>
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm">
      <div className="section-shell grid min-h-20 grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 py-4 sm:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="ENS402 home" className="flex items-center justify-self-start gap-2.5 text-xl font-semibold tracking-tight"><Layers3 className="size-6 text-primary" aria-hidden="true"/>ENS<span className="-ml-2 text-primary">402</span></Link>
        <nav aria-label="Main navigation" className="col-span-2 flex items-center justify-self-center gap-6 font-mono text-xs text-muted-foreground sm:col-span-1 sm:gap-7">
          <Link href="/#discovery" className="hover:text-foreground">How it works</Link>
          <Link href="/console" className="hover:text-foreground">Console</Link>
          <Link href="/docs" className="hover:text-foreground">Docs</Link><Link href="/register" className="hover:text-foreground">Register</Link>
        </nav>
        <Button asChild variant="outline" className="hidden justify-self-end sm:inline-flex"><Link href="/console">Console <ArrowUpRight aria-hidden="true"/></Link></Button>
      </div>
    </header>
    <main id="main-content">{children}</main>
    <footer className="border-t"><div className="section-shell flex flex-col justify-between gap-5 py-9 text-sm leading-relaxed text-muted-foreground sm:flex-row">
      <div><p className="font-medium text-foreground">ENS402</p><p className="mt-1">An independent project built on ENSv2 and x402.</p></div>
      <div className="sm:text-right"><p>Prototype · ETHGlobal Tokyo 2026</p><p className="mt-1">ENS Sepolia / payments on Base Sepolia</p><Link href="/architecture" className="mt-2 inline-block underline underline-offset-4">Design, sources & implementation status</Link></div>
    </div></footer>
  </body></html>;
}
