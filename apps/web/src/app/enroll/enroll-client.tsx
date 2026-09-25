'use client';
import { useState } from 'react';
import { CheckCircle2, Fingerprint, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type BrowserEthereum = { request(input: { method: string; params?: unknown[] }): Promise<unknown> };
export default function EnrollClient({ suggestedWallet, returnTo, secondApprover }: { suggestedWallet: string; returnTo: string; secondApprover: boolean }) {
  const [wallet,setWallet] = useState(suggestedWallet);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function enroll() {
    setBusy(true); setError('');
    try {
      const provider = (window as typeof window & { ethereum?: BrowserEthereum }).ethereum;
      if (!provider) throw new Error('An EVM browser wallet is required for this enrollment flow');
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = wallet.trim()
        ? accounts.find(item => item.toLowerCase() === wallet.trim().toLowerCase())
        : accounts[0];
      if (!account) throw new Error('Connected wallet does not match the payer address');
      setWallet(account);
      const start = await fetch('/api/enroll/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: account, returnTo }) });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error ?? 'Enrollment failed');
      const signature = await provider.request({ method: 'personal_sign', params: [started.message, account] });
      const confirmation = await fetch('/api/enroll/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: started.state, signature }) });
      const confirmed = await confirmation.json();
      if (!confirmation.ok) throw new Error(confirmed.error ?? 'Signature rejected');
      window.location.assign(confirmed.authorizationUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enrollment failed'); setBusy(false); }
  }
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(290px,.75fr)]">
    <Card className="border-border/70 bg-card/80"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{secondApprover ? 'Bind a separate wallet' : 'Bind your agent wallet'}</CardTitle><Badge variant="outline">Step 1 of 2</Badge></div><CardDescription>{secondApprover ? 'Connect a wallet you control and sign a one-time challenge. After World verification, this page returns you to the invitation.' : 'Connect the payer wallet and sign a one-time challenge. The address from your agent link stays fixed to that wallet.'}</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="grid gap-2"><Label htmlFor="payer-wallet">{secondApprover ? 'Your wallet address' : 'Payer wallet address'}</Label><Input id="payer-wallet" className="h-11 font-mono" value={wallet} onChange={event => setWallet(event.target.value)} placeholder="0x... or connect wallet" autoComplete="off"/><p className="text-xs text-muted-foreground">Leave blank to use the first connected account. No gas or payment is required to enroll.</p></div><Button className="w-fit" size="lg" type="button" onClick={enroll} disabled={busy}><Wallet/>{busy ? 'Waiting for wallet...' : 'Connect and continue'}</Button>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</CardContent></Card>
    <Card className="border-border/70 bg-card/50"><CardHeader><CardTitle className="text-lg">What happens next</CardTitle></CardHeader><CardContent className="grid gap-5"><div className="flex gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CheckCircle2 className="size-5"/></span><div><p className="font-medium">Wallet proof</p><p className="mt-1 text-sm text-muted-foreground">A signature proves control of this payer address.</p></div></div><div className="flex gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Fingerprint className="size-5"/></span><div><p className="font-medium">World sandbox</p><p className="mt-1 text-sm text-muted-foreground">A verified owner is bound to the wallet for future payment approvals.</p></div></div><p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">Your wallet key stays in the browser wallet. World confirms who approves policy changes; it does not rate a merchant or payee.</p></CardContent></Card>
  </div>;
}
