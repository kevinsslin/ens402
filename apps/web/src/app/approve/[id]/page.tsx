import { AlertTriangle, ArrowRight, Fingerprint, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataRow } from '@/components/data-row';
import { PageHeading } from '@/components/page-heading';
import { database } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Approval = {
  agent_wallet: string; service_name: string; resource_url: string; pay_to: string;
  amount_atomic: string; daily_cap_atomic: string; status: string;
  requires_second_person: boolean; first_subject: string | null; expires_at: Date; attempt_id: string | null;
};

function formatUsdcAtomic(value: string): string {
  const amount = BigInt(value);
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `$${amount / 1_000_000n}.${fraction} USDC`;
}

export default async function ApprovalPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { id } = await params;
  const { invite } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return <ApprovalUnavailable reason="This approval link is invalid."/>;
  const invitation = invite && /^[0-9a-f-]{36}$/i.test(invite) ? invite : undefined;
  let item: Approval | undefined;
  try {
    const result = await database().query<Approval>(
      `SELECT agent_wallet,service_name,resource_url,pay_to,amount_atomic::text,daily_cap_atomic::text,status,
        requires_second_person,first_subject,expires_at,attempt_id FROM approvals WHERE id=$1`, [id],
    );
    item = result.rows[0];
  } catch { return <ApprovalUnavailable reason="The approval service is not ready. Ask the agent operator to check its policy database."/>; }
  if (!item) return <ApprovalUnavailable reason="This approval request was not found."/>;

  const expired = item.expires_at.getTime() < Date.now();
  const status = expired && item.status === 'pending' ? 'expired' : item.status;
  const start = `/api/world/start?approval=${encodeURIComponent(id)}`;
  const secondPersonPending = item.status === 'pending' && !!item.first_subject;
  const canAct = item.status === 'pending' && !expired;

  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
    <PageHeading label="WORLD ID FOR AGENTS" title="Review this payment." description="Confirm the exact payment and the standing authorization it creates. World verifies the human approver, while HuFu checks the payee separately."/>
    <Alert variant={status === 'denied' || status === 'expired' ? 'destructive' : 'default'} className={status === 'denied' || status === 'expired' ? 'mb-5' : 'mb-5 border-primary/30 bg-primary/5'}><Fingerprint className="size-4"/><AlertDescription className="flex flex-wrap items-center gap-2"><strong className="font-semibold">Approval status</strong><Badge variant="outline" className="capitalize">{status}</Badge>{secondPersonPending && <span>Waiting for a second enrolled person.</span>}</AlertDescription></Alert>
    {item.attempt_id && <Button asChild variant="outline" size="sm" className="mb-5"><Link href={`/decisions/${item.attempt_id}`}>Inspect payment decision <ArrowRight/></Link></Button>}
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-border/70 bg-card/80"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Payment now</CardTitle><Badge variant="secondary">Exact payment</Badge></div><CardDescription>Only this payment request and amount are approved.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="Amount" value={<span className="text-xl text-primary">{formatUsdcAtomic(item.amount_atomic)}</span>}/><DataRow label="Agent wallet" value={item.agent_wallet} mono/><DataRow label="ENS service" value={item.service_name}/><DataRow label="Endpoint" value={item.resource_url}/><DataRow label="Payee" value={item.pay_to} mono/></CardContent></Card>
      <Card className="border-border/70 bg-card/80"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Standing authorization</CardTitle><Badge variant="outline">30 days</Badge></div><CardDescription>Future payments must keep the same owner, agent, ENS service, Base Sepolia network, and payee. A payee change needs fresh approval.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="Authorized service" value={item.service_name}/><DataRow label="Authorized payee" value={item.pay_to} mono/><DataRow label="Owner daily cap" value={formatUsdcAtomic(item.daily_cap_atomic)}/><DataRow label="Daily reset" value="00:00 UTC"/><DataRow label="This request expires" value={item.expires_at.toISOString()}/></CardContent></Card>
    </div>
    {canAct && !secondPersonPending && <Card className="mt-5 border-primary/25 bg-primary/5"><CardContent className="flex flex-col justify-between gap-5 pt-2 sm:flex-row sm:items-center"><div><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary"/>Ready for human review</p><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Continue to World sandbox. The identity must match the enrolled owner. Denial creates neither a payment authorization nor a standing grant.</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button asChild size="lg"><a href={start}>Approve with World <ArrowRight/></a></Button><Button asChild variant="destructive" size="lg"><a href={`${start}&action=deny`}>Deny</a></Button></div></CardContent></Card>}
    {canAct && secondPersonPending && <Card className="mt-5 border-primary/25 bg-primary/5"><CardHeader><CardTitle>Second person required</CardTitle><CardDescription>A different enrolled World-verified person must approve this large new-payee payment. The first person cannot approve twice.</CardDescription></CardHeader><CardContent className="grid gap-4">{invitation ? <><p className="text-sm text-muted-foreground">Use your own World identity and wallet. If you have not enrolled before, enroll first and return to this invitation.</p><div className="flex flex-wrap gap-2"><Button asChild className="w-fit"><a href={`${start}&invite=${encodeURIComponent(invitation)}`}>Continue as second person <ArrowRight/></a></Button><Button asChild variant="outline" className="w-fit"><a href={`/enroll?returnTo=${encodeURIComponent(`/approve/${id}?invite=${invitation}`)}`}>Enroll your wallet first</a></Button></div><div><p className="mb-1 text-xs font-medium text-muted-foreground">Invitation link</p><code className="block break-all rounded-md border border-border bg-background/50 p-3 text-xs text-foreground">{`${process.env.POLICY_ORIGIN ?? ''}/approve/${id}?invite=${invitation}`}</code></div></> : <p className="text-sm text-muted-foreground">Ask the first approver for the invitation link generated after their World verification.</p>}</CardContent></Card>}
    {(status === 'denied' || status === 'expired') && <Alert variant="destructive" className="mt-5"><AlertTriangle className="size-4"/><AlertDescription>This request cannot authorize payment. The agent must create a new request.</AlertDescription></Alert>}
  </div>;
}

function ApprovalUnavailable({ reason }: { reason: string }) {
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20"><PageHeading label="WORLD ID FOR AGENTS" title="Approval unavailable." description="No payment or standing authorization was created from this page."/><Card className="max-w-2xl border-border/70 bg-card/80"><CardHeader><CardTitle>Unable to load this request</CardTitle><CardDescription>Check the approval link supplied by the agent.</CardDescription></CardHeader><CardContent><Alert variant="destructive"><AlertTriangle className="size-4"/><AlertDescription>{reason}</AlertDescription></Alert></CardContent></Card></div>;
}
