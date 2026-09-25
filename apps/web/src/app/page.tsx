import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Fingerprint, LockKeyhole, Search, ShieldCheck, Split } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  { icon: Search, number: '01', title: 'Find a service', text: 'Search Bazaar for a capability and price. Treat every listing as a candidate.' },
  { icon: Fingerprint, number: '02', title: 'Check ENS authority', text: 'Resolve the merchant-controlled endpoint and Base Sepolia payee from ENSv2.' },
  { icon: ShieldCheck, number: '03', title: 'Pay with policy', text: 'Match the live 402, scan the payee, check limits, and request World approval when authority expands.' },
];

export default function Home() {
  return <>
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-20 lg:min-h-[680px] lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)] lg:gap-16 lg:pb-24 lg:pt-16">
      <div>
        <Badge variant="outline" className="border-primary/35 bg-primary/5 text-primary">PAYMENT AUTHORITY FOR AUTONOMOUS AGENTS</Badge>
        <h1 className="mt-7 max-w-3xl text-[clamp(3.5rem,6.5vw,6.5rem)] font-semibold leading-[1.02] tracking-[-0.065em]">Agents choose services. <span className="text-primary">HuFu decides when they can pay.</span></h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">HuFu turns an x402 candidate into an authorized payment decision. It checks merchant authority, payee risk, spending policy, and human approval before an agent signs.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href="/discover">Explore Bazaar <ArrowRight/></Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/lookup">Verify an ENS service</Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/decisions">Inspect a decision</Link></Button>
        </div>
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-primary"/>No match, no payment. Ask a human only when authority expands.</p>
      </div>
      <Card className="relative overflow-hidden border-primary/25 bg-card/80 shadow-2xl shadow-black/10">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary"/>
        <CardHeader className="border-b border-border/70 pb-5">
          <div className="flex items-center justify-between gap-3"><Badge variant="secondary">THE TWO HALVES</Badge><Split className="size-5 text-primary" aria-hidden="true"/></div>
          <CardTitle className="mt-3 text-2xl tracking-tight">One payment. Two sources.</CardTitle>
          <CardDescription className="text-sm leading-relaxed">A service response can say where to pay. ENS records who the merchant authorized.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-2">
          <div className="rounded-lg border border-border bg-background/70 p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground"><span>Live x402 response</span><span>01 / service</span></div>
            <p className="mt-3 font-mono text-sm"><span className="text-muted-foreground">payTo</span> <span className="text-foreground">0x…A42F</span></p>
          </div>
          <div className="flex items-center gap-3 px-1"><div className="h-px flex-1 bg-border"/><span className="flex size-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"><Check className="size-4"/></span><div className="h-px flex-1 bg-border"/></div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-primary"><span>ENSv2 payment record</span><span>02 / merchant</span></div>
            <p className="mt-3 font-mono text-sm"><span className="text-muted-foreground">payee</span> <span className="text-foreground">0x…A42F</span></p>
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"><ShieldCheck className="size-5"/>Address match. Continue to risk and policy checks.</div>
          <p className="text-xs leading-relaxed text-muted-foreground">Illustration only. HuFu checks the full addresses and the endpoint against live records for each payment.</p>
        </CardContent>
      </Card>
    </section>
    <section className="border-y border-border/70 bg-card/20"><div className="mx-auto max-w-7xl px-6 py-20">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><span className="text-xs font-semibold tracking-[.18em] text-primary">THE PAYMENT PATH</span><h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Find freely. Pay deliberately.</h2></div><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Discovery helps agents choose. Independent authority and spending policy make the choice payable.</p></div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">{steps.map(step => <Card key={step.number} className="border-border/70 bg-card/80"><CardHeader><div className="mb-7 flex items-center justify-between text-primary"><span className="font-mono text-sm">{step.number}</span><step.icon className="size-5" aria-hidden="true"/></div><CardTitle className="text-xl">{step.title}</CardTitle></CardHeader><CardContent><CardDescription className="text-base leading-relaxed">{step.text}</CardDescription></CardContent></Card>)}</div>
    </div></section>
    <section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
      <div><Badge variant="outline" className="border-primary/35 text-primary">SEPARATE KEYS, CLEAR AUTHORITY</Badge><h2 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">The server cannot move the merchant&apos;s payee.</h2><p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">A Treasury Safe controls the ENS payment address. A scoped operations key can update the service endpoint. The agent checks both against the live 402 before signing.</p><Button asChild variant="outline" className="mt-7"><Link href="/lookup">Inspect ENS authority <ArrowRight/></Link></Button></div>
      <Card className="bg-card/80"><CardContent className="grid gap-5 pt-2"><div className="flex gap-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><LockKeyhole className="size-5"/></div><div><h3 className="font-medium">Treasury Safe</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Controls the payee record and resolver permissions.</p></div></div><div className="flex gap-4 border-t border-border pt-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><ArrowUpRight className="size-5"/></div><div><h3 className="font-medium">Service operations</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Can update only its endpoint record, without changing where payment goes.</p></div></div></CardContent></Card>
    </section>
  </>;
}
