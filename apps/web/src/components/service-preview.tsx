'use client';

import { useState } from 'react';
import { NETWORK, USDC, verifyRequest, evaluateRisk, type Decision } from '@ens402/sdk';
import { ArrowDown, Check, CornerDownRight, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const scenarios = {
  normal: { label: 'Matching request', path: '/search/v1', payee: 'Treasury A' },
  moved: { label: 'Endpoint moved', path: '/search/v2', payee: 'Treasury A' },
  mismatch: { label: 'Payee changed', path: '/search/v1', payee: 'Unknown wallet' },
  risk: { label: 'Risk flagged', path: '/search/v1', payee: 'Treasury A' },
  unavailable: { label: 'Scan unavailable', path: '/search/v1', payee: 'Treasury A' },
} as const;
type Scenario = keyof typeof scenarios;

export function ServicePreview() {
  const [selected, setSelected] = useState<Scenario>('normal');
  const current = scenarios[selected];
  const payTo = '0x2222222222222222222222222222222222222222';
  const requestedPayee = selected === 'mismatch' ? '0x3333333333333333333333333333333333333333' : payTo;
  const endpoint = `https://api.dataco.com${current.path}`;
  const fixtureTime = 1000;
  let verdict: Decision = verifyRequest({ name: 'search.dataco.eth', endpoint, status: 'active', authority: 'illustrative-deployment', block: 'fixture', observedAt: fixtureTime, payment: { version: 1, scheme: 'exact', network: NETWORK, asset: USDC, payTo } }, endpoint,
    { scheme: 'exact', network: NETWORK, asset: USDC, payTo: requestedPayee, amount: '10000', maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } },
    { name: 'search.dataco.eth', authority: 'illustrative-deployment', endpoints: ['https://api.dataco.com/search/v1', 'https://api.dataco.com/search/v2'], payTo, maxAmount: '10000', expiresAt: fixtureTime + 600 }, fixtureTime);
  if (verdict.outcome === 'continue') {
    verdict = selected === 'unavailable' ? { outcome: 'hold', reason: 'Screening unavailable; no signature requested' } : evaluateRisk({ provider: 'intercepta', network: 'ethereum-mainnet', address: payTo, observedAt: fixtureTime, expiresAt: fixtureTime + 3600, cached: false, scan: { toxicScore: 0, traits: selected === 'risk' ? [{ name: 'known_scammer', risk: 1, txsCount: 1, description: 'Synthetic test fixture' }] : [] } }, payTo, fixtureTime);
  }
  const allowed = verdict.outcome === 'continue';
  return <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/20">
    <div className="flex items-center justify-between gap-3 border-b px-5 py-4"><span className="font-mono text-xs text-muted-foreground">RUN THE PAYMENT CHECKS</span><Badge variant="outline" className="text-muted-foreground">Fixture inputs</Badge></div>
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
      <div className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm"><span className="text-muted-foreground">Requested recipient</span><span className={`flex items-center gap-2 font-medium ${selected !== 'mismatch' ? 'text-primary' : 'text-destructive'}`}>{current.payee}{selected !== 'mismatch' ? <Check className="size-4" aria-hidden="true"/> : <X className="size-4" aria-hidden="true"/>}</span></div>
      <div className={`mt-5 flex items-start gap-3 ${allowed ? 'text-primary' : 'text-destructive'}`}><ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true"/><div><p className="text-sm font-medium">{allowed ? 'Checks passed. Ready for Privy.' : verdict.outcome === 'hold' ? 'Hold. No signature requested.' : 'Rejected before signing.'}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{verdict.reason}</p></div></div>
    </div>
    <p className="border-t px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">Real SDK rules with simulated ENS, 402 and risk inputs. Privy is the default signing adapter; live signing awaits credentials. No payment is sent.</p>
  </div>;
}
