'use client';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, CheckCircle2, Fingerprint, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { DataRow } from '@/components/data-row';

type Authority = { name: string; endpoint: string; payTo: string; resolver: string; implementation: string };
type History = { events: Array<{ blockNumber: string; transactionHash: string; payTo: string | null }>; fromBlock: string; toBlock: string; complete: boolean };
type Candidate = { candidateUrl: string; candidatePayTo: string };

function normalizedHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}
function comparison(candidate: Candidate, authority: Authority) {
  const endpoint = normalizedHttpsUrl(candidate.candidateUrl);
  const urlMatch = endpoint ? endpoint === authority.endpoint : null;
  const payeeMatch = /^0x[0-9a-fA-F]{40}$/.test(candidate.candidatePayTo)
    ? candidate.candidatePayTo.toLowerCase() === authority.payTo.toLowerCase() : null;
  return { urlMatch, payeeMatch, complete: urlMatch === true && payeeMatch === true, mismatch: urlMatch === false || payeeMatch === false };
}

export default function LookupClient({ initialName, candidateUrl, candidatePayTo }: { initialName: string; candidateUrl: string; candidatePayTo: string }) {
  const [name, setName] = useState(initialName);
  const [result, setResult] = useState<Authority | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState('');
  const fromCatalog = !!candidateUrl || !!candidatePayTo;
  const candidate = { candidateUrl, candidatePayTo };
  const match = result && fromCatalog ? comparison(candidate, result) : null;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null); setHistory(null); setHistoryError('');
    try {
      const response = await fetch(`/api/lookup?name=${encodeURIComponent(name.trim())}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Lookup failed');
      setResult(body);
      try {
        const historyResponse = await fetch(`/api/history?name=${encodeURIComponent(body.name)}`, { cache: 'no-store' });
        const historyBody = await historyResponse.json();
        if (!historyResponse.ok) throw new Error(historyBody.error ?? 'History lookup failed');
        setHistory(historyBody);
      } catch (cause) { setHistoryError(cause instanceof Error ? cause.message : 'History lookup failed'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Lookup failed'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-5">
    {fromCatalog && <Card className="border-border/70 bg-card/80"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Candidate from Bazaar</CardTitle><Badge variant="outline">Untrusted input</Badge></div><CardDescription>These values came from a catalog listing. HuFu compares them with live ENS records; a match still does not validate the live 402 or service quality.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><DataRow label="Listed endpoint" value={candidateUrl || 'Not provided'}/><DataRow label="Listed payee" value={candidatePayTo || 'Not provided'} mono/></CardContent></Card>}
    <Card className="border-border/70 bg-card/80"><CardContent className="pt-2"><form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}><div className="grid flex-1 gap-2"><Label htmlFor="service-name">Merchant ENS service name</Label><Input id="service-name" required disabled={busy} className="h-11" value={name} onChange={event => { setName(event.target.value); setResult(null); setHistory(null); setHistoryError(''); setError(''); }} placeholder="search.merchant.eth" maxLength={255}/></div><Button size="lg" disabled={busy}><Search/>{busy ? 'Resolving...' : 'Verify service'}</Button></form><p className="mt-3 text-xs text-muted-foreground">The service name must come from the merchant or another source you trust. A Bazaar hint alone is untrusted.</p></CardContent></Card>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {busy && <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Resolving ENS service">{[0, 1].map(item => <Card key={item}><CardHeader><Skeleton className="h-5 w-48"/></CardHeader><CardContent className="grid gap-4"><Skeleton className="h-4 w-28"/><Skeleton className="h-4 w-full"/><Skeleton className="h-4 w-2/3"/></CardContent></Card>)}</div>}
    {result && <>
      <Alert variant={match?.mismatch ? 'destructive' : 'default'} className={match?.complete ? 'border-primary/35 bg-primary/5' : ''}>
        {match?.mismatch ? <ShieldAlert className="size-4"/> : match?.complete ? <CheckCircle2 className="size-4 text-primary"/> : <Fingerprint className="size-4"/>}
        <AlertDescription><strong className="font-semibold">{match?.mismatch ? 'Candidate does not match ENS.' : match?.complete ? 'Catalog candidate matches ENS.' : 'ENS authority resolved.'}</strong> {match?.mismatch ? 'Do not pay this candidate. Check the merchant and its current records.' : match?.complete ? 'The SDK must still inspect the live 402, risk, and spending policy before signing.' : 'Compare its endpoint and payee with a live 402 before payment.'}</AlertDescription>
      </Alert>
      <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Merchant declaration</CardTitle><Badge variant="secondary"><ShieldCheck className="size-3"/> ENSv2 resolver</Badge></div></CardHeader><CardContent className="grid gap-4"><DataRow label="Service name" value={result.name}/><DataRow label="Declared endpoint" value={<a className="inline-flex items-center gap-1 text-primary hover:underline" href={result.endpoint} target="_blank" rel="noreferrer">{result.endpoint}<ArrowUpRight className="size-4 shrink-0"/></a>}/><DataRow label="Base Sepolia payee" value={result.payTo} mono/></CardContent></Card>
      <Card><CardHeader><CardTitle>Comparison</CardTitle><CardDescription>Only values present in the candidate can be compared. HuFu checks the live 402 separately when the agent pays.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="Endpoint" value={match ? match.urlMatch === null ? 'Not provided' : match.urlMatch ? 'Matches ENS' : 'Mismatch' : 'No candidate supplied'}/><DataRow label="Payee" value={match ? match.payeeMatch === null ? 'Not provided' : match.payeeMatch ? 'Matches ENS' : 'Mismatch' : 'No candidate supplied'}/><Separator/><p className="text-xs leading-relaxed text-muted-foreground">Resolver provenance and implementation were checked against the expected ENSv2 deployment on Sepolia.</p></CardContent></Card></div>
      <Card><CardHeader><CardTitle>Recent onchain payee changes</CardTitle><CardDescription>AddressChanged events from this resolver for the service and Base Sepolia coin type. {history ? `Blocks ${history.fromBlock} to ${history.toBlock}.` : 'Loading block range.'} Earlier events and former resolvers may be omitted.</CardDescription></CardHeader><CardContent className="grid gap-4">{historyError && <Alert variant="destructive"><AlertDescription>{historyError}</AlertDescription></Alert>}{!history && !historyError && <div className="grid gap-2"><Skeleton className="h-4 w-36"/><Skeleton className="h-4 w-2/3"/></div>}{history?.events.length === 0 && <p className="text-sm text-muted-foreground">No payee changes found in this block window.</p>}{history?.events.map(item => <div key={`${item.transactionHash}-${item.blockNumber}`} className="border-t border-border pt-4"><DataRow label={`Block ${item.blockNumber}`} value={item.payTo ?? 'Address record cleared'} mono/><a className="mt-2 inline-flex items-center gap-1 break-all text-xs text-primary hover:underline" href={`https://sepolia.etherscan.io/tx/${item.transactionHash}`} target="_blank" rel="noreferrer">View transaction <ArrowUpRight className="size-3"/></a></div>)}</CardContent></Card>
    </>}
    {!busy && !result && !error && !fromCatalog && <Card className="border-dashed bg-card/40"><CardContent className="flex items-start gap-3 pt-2"><Fingerprint className="mt-0.5 size-5 text-primary"/><div><p className="font-medium">Resolve independent authority</p><p className="mt-1 text-sm text-muted-foreground">Enter a merchant service name to inspect its endpoint, payee, and resolver provenance.</p></div></CardContent></Card>}
  </div>;
}
