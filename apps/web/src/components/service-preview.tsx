'use client';

import { useState } from 'react';
import { ArrowDown, Check, CornerDownRight, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const scenarios = {
  normal: { label: 'Matching request', path: '/search/v1', payee: 'Treasury A', result: 'Ready for your payment policy', detail: 'The request matches the published configuration. No blocking risk signal in this example.', allowed: true },
  moved: { label: 'Endpoint moved', path: '/search/v2', payee: 'Treasury A', result: 'Same name. Current endpoint.', detail: 'Resolve again and verify the new route. This example assumes /search/v2 is inside the buyer-approved scope.', allowed: true },
  mismatch: { label: 'Payee changed', path: '/search/v1', payee: 'Unknown wallet', result: 'Reject this payment request', detail: 'The HTTP 402 recipient differs from the ENS payment record. Do not send this request to your signer.', allowed: false },
} as const;
type Scenario = keyof typeof scenarios;

export function ServicePreview() {
  const [selected, setSelected] = useState<Scenario>('normal');
  const current = scenarios[selected];
  return <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/20">
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><span className="font-mono text-xs text-muted-foreground">SERVICE CONFIGURATION</span><Badge variant="outline" className="text-muted-foreground">Illustrative</Badge></div>
    <div className="flex flex-wrap gap-2 border-b p-4" role="group" aria-label="Example scenario">
      {(Object.keys(scenarios) as Scenario[]).map(key => <Button key={key} variant={selected === key ? 'secondary' : 'ghost'} size="sm" className="min-h-9" aria-pressed={selected === key} onClick={() => setSelected(key)}>{scenarios[key].label}</Button>)}
    </div>
    <div className="p-5 sm:p-6" aria-live="polite" aria-atomic="true">
      <div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 font-mono text-primary">01</span><div><p className="text-xs text-muted-foreground">Stable service name</p><p className="mt-1 font-mono text-lg tracking-tight sm:text-xl">search.dataco.eth</p></div></div>
      <div className="ml-4 border-l py-4 pl-7"><p className="flex items-center gap-2 text-xs text-muted-foreground"><CornerDownRight className="size-3" aria-hidden="true"/> ENS resolution</p></div>
      <dl className="space-y-3 rounded-lg border bg-background/70 p-4 font-mono text-xs sm:text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">endpoint</dt><dd className="text-right text-primary">api.dataco.com{current.path}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">network</dt><dd>Base Sepolia</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">asset</dt><dd>USDC</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">payTo</dt><dd>Treasury A</dd></div>
      </dl>
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><ArrowDown className="size-3.5" aria-hidden="true"/> Compare with the actual HTTP 402</div>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm"><span className="text-muted-foreground">Requested recipient</span><span className={`flex items-center gap-2 font-medium ${current.allowed ? 'text-primary' : 'text-destructive'}`}>{current.payee}{current.allowed ? <Check className="size-4" aria-hidden="true"/> : <X className="size-4" aria-hidden="true"/>}</span></div>
      <div className={`mt-5 flex items-start gap-3 ${current.allowed ? 'text-primary' : 'text-destructive'}`}><ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true"/><div><p className="text-sm font-medium">{current.result}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{current.detail}</p></div></div>
    </div>
    <p className="border-t px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">Interactive design example. No live ENS lookup, scan, signature, or payment.</p>
  </div>;
}
