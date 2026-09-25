'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Search, ShieldQuestion } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type Payment = { payTo?: string; network?: string; amount?: string; asset?: string; scheme?: string };
type Resource = {
  resource?: string; description?: string; serviceName?: string;
  accepts?: Payment[];
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number };
};
const usdc = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

function safeResourceUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}
function baseSepoliaPayment(item: Resource): Payment | undefined {
  return item.accepts?.find(accept => accept.network === 'eip155:84532' &&
    accept.asset?.toLowerCase() === usdc && accept.scheme === 'exact' &&
    (accept.amount?.length ?? 0) <= 20 && /^[1-9][0-9]*$/.test(accept.amount ?? ''));
}
function catalogPrice(payment?: Payment): string | null {
  if (!payment?.amount) return null;
  const amount = BigInt(payment.amount);
  return `$${(amount / 1_000_000n).toString()}.${(amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0')}`;
}
function ensHint(description?: string): string | null {
  const hint = /\bENS service:\s*([a-z0-9.-]+\.eth)\b/i.exec(description ?? '')?.[1];
  return hint && hint.length <= 255 ? hint.toLowerCase() : null;
}
function verifyHref(name: string | null, resourceUrl: string | null, payTo?: string): string {
  const params = new URLSearchParams();
  if (name) params.set('name', name);
  if (resourceUrl) params.set('candidateUrl', resourceUrl);
  if (payTo && /^0x[0-9a-fA-F]{40}$/.test(payTo)) params.set('candidatePayTo', payTo);
  return `/lookup?${params.toString()}`;
}

export default function DiscoverClient() {
  const [query, setQuery] = useState('weather');
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setSearched(true); setError(''); setResources([]);
    try {
      const response = await fetch(`/api/discover?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Search failed');
      setResources(Array.isArray(body.resources) ? body.resources : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Search failed'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-6">
    <Card className="border-border/70 bg-card/80"><CardContent className="pt-2">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={search}>
        <div className="grid flex-1 gap-2"><Label htmlFor="service-query">What service does your agent need?</Label><Input id="service-query" className="h-11" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. weather data" maxLength={100} required/></div>
        <Button size="lg" disabled={busy}><Search/>{busy ? 'Searching...' : 'Search Bazaar'}</Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">Public CDP Bazaar · Base Sepolia · Listings are leads, not payment authorization.</p>
    </CardContent></Card>

    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {busy && <div className="grid gap-4" role="status" aria-label="Searching Bazaar">{[0, 1].map(item => <Card key={item}><CardHeader><Skeleton className="h-5 w-48"/><Skeleton className="h-4 w-full max-w-md"/></CardHeader><CardContent><Skeleton className="h-4 w-full max-w-lg"/></CardContent></Card>)}</div>}

    {!busy && resources.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-semibold">Candidates</h2><p className="text-sm text-muted-foreground">Compare the listing with ENS before trusting its payee.</p></div><Badge variant="secondary">{resources.length} found</Badge></div>}
    <div className="grid gap-4">{resources.map((item, index) => {
      const resourceUrl = safeResourceUrl(item.resource);
      const payment = baseSepoliaPayment(item);
      const price = catalogPrice(payment);
      const name = ensHint(item.description);
      return <Card key={`${item.resource ?? 'resource'}-${index}`} className="border-border/70 bg-card/80">
        <CardHeader className="gap-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg">{item.serviceName ?? 'Unnamed service'}</CardTitle>{name && <p className="mt-1 font-mono text-xs text-primary">ENS hint: {name}</p>}</div><div className="flex flex-wrap gap-2"><Badge variant="outline">Unverified</Badge>{price && <Badge variant="secondary">{price} USDC</Badge>}</div></div><CardDescription className="max-w-3xl leading-relaxed">{item.description ?? 'No description provided.'}</CardDescription></CardHeader>
        <CardContent className="grid gap-4"><div className="min-w-0 rounded-lg border border-border bg-background/50 p-3"><span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">Catalog endpoint</span>{resourceUrl ? <a className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-sm text-foreground hover:text-primary hover:underline" href={resourceUrl} target="_blank" rel="noreferrer">{resourceUrl}<ArrowUpRight className="size-4 shrink-0"/></a> : <p className="mt-1 text-sm text-destructive">Not a valid HTTPS endpoint</p>}</div>
          <div className="flex flex-wrap items-end justify-between gap-4"><div className="grid gap-1 text-xs text-muted-foreground"><span>{item.quality ? `${item.quality.l30DaysTotalCalls ?? 'Unknown'} calls · ${item.quality.l30DaysUniquePayers ?? 'Unknown'} distinct payers in 30 days` : 'Catalog activity unavailable'}</span><span>Usage does not establish uptime or safety.</span></div><Button asChild variant={name ? 'default' : 'outline'}><Link href={verifyHref(name, resourceUrl, payment?.payTo)}>{name ? 'Compare with ENS' : 'Find ENS authority'}<ArrowRight/></Link></Button></div>
          {!name && <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldQuestion className="mt-0.5 size-4 shrink-0"/><span>No ENS name is advertised in this listing. You will need the merchant&apos;s service name to verify it independently.</span></div>}
        </CardContent>
      </Card>;
    })}</div>
    {!busy && !error && resources.length === 0 && <Card className="border-dashed bg-card/40"><CardContent className="flex items-start gap-3 pt-2"><Search className="mt-0.5 size-5 text-primary"/><div><p className="font-medium">{searched ? 'No services matched this search' : 'Start with a capability'}</p><p className="mt-1 text-sm text-muted-foreground">{searched ? 'Try another phrase or a broader service category.' : 'Search the public Bazaar to see real testnet service candidates.'}</p></div></CardContent></Card>}
  </div>;
}
