import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist } from 'next/font/google';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SiteNav } from '@/components/site-nav';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
export const metadata: Metadata = {
  title: 'HuFu | Payee verification for x402 agents',
  description: 'Independent payment authority for autonomous x402 service discovery.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={cn('dark font-sans', geist.variable)}><body className="min-h-screen antialiased">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to content</a>
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md"><div className="mx-auto flex h-18 max-w-7xl items-center gap-3 px-3 sm:gap-7 sm:px-6">
      <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="HuFu home"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-xl text-primary-foreground">虎</span><span className="text-xl">HuFu</span><sup className="-ml-1 self-start pt-1 text-xs text-primary">402</sup></Link>
      <SiteNav/>
      <Badge variant="outline" className="hidden border-primary/40 text-primary sm:inline-flex"><span className="mr-1 size-1.5 rounded-full bg-primary"/>Testnet</Badge>
    </div></header>
    <main id="main-content" className="min-h-[calc(100vh-9rem)]">{children}</main>
    <Separator/><footer className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-7 text-xs text-muted-foreground sm:flex-row"><span>HuFu verifies payees for SDK-mediated x402 payments.</span><span>Base Sepolia payments · ENSv2 Sepolia · World sandbox</span></footer>
  </body></html>;
}
