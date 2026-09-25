import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Fingerprint, Globe2, Layers3, LockKeyhole, ScanLine, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ServicePreview } from '@/components/service-preview';

const layers = [
  { number: '01', title: 'Resolve', icon: Globe2, source: 'ENS + service records', text: 'Start with a stable ENS name. Read the current endpoint, payment configuration, and service status.', question: 'Where is this service now?' },
  { number: '02', title: 'Verify', icon: ShieldCheck, source: 'Native ENSv2 EAC + client checks', text: 'Inspect configuration authority. Compare the actual 402 with the published chain, token, and recipient.', question: 'Does this request match?' },
  { number: '03', title: 'Screen', icon: ScanLine, source: 'Intercepta risk evidence', text: 'Use address-risk signals and explicit rules to continue, hold, or reject before requesting a payment signature.', question: 'Is there a reason to stop?' },
];

export default function Home() {
  return <>
    <section className="section-shell grid items-center gap-12 pb-16 pt-14 sm:pb-24 sm:pt-20 lg:grid-cols-[1.08fr_1fr] lg:gap-12">
      <div>
        <p className="eyebrow flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary"/> An ENS-based stack for x402</p>
        <h1 className="mt-7 text-[clamp(3.3rem,6.1vw,5.7rem)] font-medium leading-[1.02] tracking-[-.065em]">A name to resolve.<br/><span className="text-primary">A payment<br/>to verify.</span></h1>
        <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted-foreground">Use ENS as the public configuration layer for x402 services. Resolve the current endpoint, verify payment requirements, and screen risk before your agent pays.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg" className="h-11 px-5"><a href="#stack">Explore the stack <ArrowRight aria-hidden="true"/></a></Button><Button asChild variant="outline" size="lg" className="h-11 px-5"><a href="#integrate">Bring your own wallet</a></Button></div>
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-muted-foreground"><span>PUBLIC CONFIGURATION</span><span>NATIVE PERMISSIONS</span><span>WALLET-INDEPENDENT DESIGN</span></div>
      </div>
      <ServicePreview/>
    </section>

    <section className="border-y bg-card/40"><div className="section-shell grid gap-5 py-8 md:grid-cols-[.85fr_1.5fr] md:gap-12"><h2 className="text-xl font-medium tracking-tight">The URL can change.<br/>The service name can stay.</h2><p className="text-sm leading-7 text-muted-foreground">A standard x402 payment challenge tells a client how to pay. ENS402 adds an ENS resolution and verification step: clients discover a name, resolve its current configuration, and check the actual request before signing. Supported clients follow approved updates without hardcoding every endpoint.</p></div></section>

    <section id="stack" className="section-shell py-20 sm:py-24">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">01 / The stack</p><h2 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl">Three checks.<br/>Before money moves.</h2></div><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Keep your discovery strategy and payment wallet. Add a shared source of service configuration between them.</p></div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">{layers.map(layer => <Card key={layer.number} className="border shadow-none"><CardHeader className="p-6 pb-0"><div className="mb-7 flex items-center justify-between"><span className="font-mono text-xs text-muted-foreground">{layer.number}</span><layer.icon className="size-5 text-primary" aria-hidden="true"/></div><CardTitle><h3 className="text-2xl font-medium tracking-tight">{layer.title}</h3></CardTitle></CardHeader><CardContent className="p-6 pt-2"><p className="min-h-24 text-sm leading-6 text-muted-foreground">{layer.text}</p><p className="mt-5 border-t pt-4 text-xs text-primary">{layer.source}</p><p className="mt-2 text-xs text-muted-foreground">{layer.question}</p></CardContent></Card>)}</div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-5 py-4 font-mono text-xs text-muted-foreground"><span>Your discovery</span><ArrowRight className="size-3" aria-hidden="true"/><span className="text-primary">ENS402: resolve / verify / screen</span><ArrowRight className="size-3" aria-hidden="true"/><span>Your policy + x402 wallet</span></div>
    </section>

    <section id="permissions" className="border-y bg-card/40"><div className="section-shell grid gap-10 py-20 lg:grid-cols-2 lg:gap-16">
      <div><p className="eyebrow">02 / Native ENSv2 permissions</p><h2 className="mt-4 text-4xl font-medium leading-tight tracking-tight">Let an agent update<br/>the endpoint.<br/><span className="text-primary">Keep payment settings<br/>with Treasury.</span></h2><p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">Grant a wallet permission to change one public record. ENSv2 EAC rejects writes outside that grant. The client separately checks whether the resulting request fits the buyer&apos;s approval.</p><p className="mt-4 text-xs leading-6 text-muted-foreground">Native permissions control record edits. They do not deploy an API, enforce a buyer&apos;s budget, or guarantee service quality.</p></div>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center gap-2 border-b px-5 py-4 text-sm"><LockKeyhole className="size-4 text-primary" aria-hidden="true"/>Who can change what?</div>
        {[
          { role: 'Endpoint updater', record: 'agent-endpoint[x402]', action: 'Publish the current API URL', permission: 'Endpoint key only' },
          { role: 'Treasury', record: 'ens402.payment', action: 'Update chain, token, and recipient', permission: 'Payment key' },
          { role: 'Status administrator', record: 'ens402.status', action: 'Publish active or suspended', permission: 'Status key' },
          { role: 'Permission administrator', record: 'Native EAC grants', action: 'Grant, revoke, and replace updaters', permission: 'Administrative rights' },
        ].map(item => <div key={item.role} className="border-b px-5 py-5 last:border-0"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-medium">{item.role}</h3><span className="text-xs text-primary">{item.permission}</span></div><p className="mt-2 font-mono text-xs text-muted-foreground">{item.record}</p><p className="mt-1 text-xs text-muted-foreground">{item.action}</p></div>)}
      </div>
    </div></section>

    <section id="integrate" className="section-shell grid gap-10 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16">
      <div><p className="eyebrow">03 / Built to fit your agent</p><h2 className="mt-4 text-4xl font-medium tracking-tight">Your agent.<br/>Your wallet.<br/><span className="text-primary">A shared verification stack.</span></h2><p className="mt-6 text-sm leading-7 text-muted-foreground">The proposed integration returns configuration, comparison results, and risk evidence. Your application chooses its approval rules and signing provider. A Privy or CDP account is not a requirement of the core design.</p><Button asChild variant="outline" className="mt-6 h-10 px-4"><Link href="/architecture">Read the integration boundaries <ArrowUpRight aria-hidden="true"/></Link></Button></div>
      <div className="min-w-0 rounded-xl border bg-card"><div className="flex items-center justify-between gap-3 border-b px-5 py-4"><span className="font-mono text-xs text-muted-foreground">INTEGRATION CONTRACT</span><Badge variant="outline">Proposed</Badge></div><ol className="space-y-0 p-6">{[
        ['INPUT', 'ENS service name + actual 402 request', 'Use a name from your catalog, Bazaar, or an agent registry.'],
        ['EVIDENCE', 'Resolved configuration + checks + risk', 'Keep block references, scan provenance, and clear failure reasons.'],
        ['HANDOFF', 'Your application decides whether to sign', 'Use your own wallet, policy engine, or supported delegation.'],
      ].map(([label, title, text], i) => <li key={label} className={`${i ? 'mt-6 border-t pt-6' : ''}`}><p className="font-mono text-[11px] text-primary">{label}</p><p className="mt-2 text-sm font-medium">{title}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{text}</p></li>)}</ol><p className="border-t px-6 py-4 text-xs leading-6 text-muted-foreground">SDK packaging is planned. Enforcement comes from the signing path you connect; an unrestricted key can bypass client checks.</p></div>
    </section>

    <section className="border-t bg-card/40"><div className="section-shell py-20">
      <div className="max-w-2xl"><p className="eyebrow">04 / Evidence with a specific job</p><h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Configuration is one part of trust.</h2><p className="mt-5 text-sm leading-7 text-muted-foreground">A matching recipient is not a guarantee of a good service. Use separate evidence for payment risk, human approval, and service reputation.</p></div>
      <div className="mt-9 grid gap-8 md:grid-cols-3">
        <div><ScanLine className="size-5 text-primary" aria-hidden="true"/><h3 className="mt-4 font-medium">Intercepta / screening</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">An address scan returns a toxicScore and traits such as known_scammer. Your policy interprets the actual evidence before signing.</p><Link href="/architecture#screening" className="mt-4 inline-flex items-center gap-1 text-sm text-primary">See response examples <ArrowRight className="size-3.5" aria-hidden="true"/></Link></div>
        <div><Fingerprint className="size-5 text-muted-foreground" aria-hidden="true"/><h3 className="mt-4 font-medium">World / optional human review</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Recognize the returning owner and request fresh authentication for important approval changes. Explicit consent stays with your app.</p></div>
        <div><Layers3 className="size-5 text-muted-foreground" aria-hidden="true"/><h3 className="mt-4 font-medium">ERC-8004 / future reputation input</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Link a service name to an agent identity and its feedback. Selection and reputation scoring remain with your discovery logic.</p><Link href="/architecture#reputation" className="mt-4 inline-flex items-center gap-1 text-sm text-primary">How identity mapping works <ArrowRight className="size-3.5" aria-hidden="true"/></Link></div>
      </div>
    </div></section>
    <section className="section-shell flex flex-col justify-between gap-6 py-12 sm:flex-row sm:items-center"><div><p className="eyebrow">Development status</p><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Native resolver permissions have been exercised on an isolated Sepolia fork. This site explains the design; live resolution, risk screening, and the full payment integration are still being built.</p></div><Button asChild variant="outline" className="h-10 shrink-0 px-4"><Link href="/architecture#status">What is verified <ArrowRight aria-hidden="true"/></Link></Button></section>
  </>;
}
