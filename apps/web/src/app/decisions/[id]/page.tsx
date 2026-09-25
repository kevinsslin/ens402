import Link from 'next/link';
import { ArrowUpRight, Fingerprint, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataRow } from '@/components/data-row';
import { PageHeading } from '@/components/page-heading';
import { getDecisionReceipt } from '@/lib/decision';

export const dynamic = 'force-dynamic';

function usdc(value: string | null | undefined): string {
  if (!value) return 'Not evaluated';
  const amount = BigInt(value);
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `$${amount / 1_000_000n}.${fraction} USDC`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    checking: 'Checking', refused: 'Payment refused', paused: 'Payment paused',
    approval_required: 'Human approval required', approved_waiting_for_agent: 'Approved, awaiting agent retry',
    approved_intent_expired: 'Approved, original intent expired', invalid_receipt: 'Receipt integrity failed',
    expired: 'Approval expired', reserved: 'Authorized, awaiting settlement',
    settled: 'Settled on Base Sepolia', uncertain: 'Settlement unconfirmed', released: 'Reservation released',
  };
  return labels[status] ?? status;
}

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return <Unavailable reason="This decision link is invalid."/>;
  let receipt: Awaited<ReturnType<typeof getDecisionReceipt>>;
  try { receipt = await getDecisionReceipt(id); }
  catch { return <Unavailable reason="The policy database is not ready. Try again after it is configured."/>; }
  if (!receipt) return <Unavailable reason="This payment attempt was not found."/>;

  const intent = receipt.signedIntent;
  const authority = receipt.authority;
  const risk = receipt.risk;
  const refused = ['refused', 'paused', 'expired', 'uncertain', 'invalid_receipt', 'approved_intent_expired'].includes(receipt.status);
  const endpointMatch = authority ? authority.endpoint === intent.resourceUrl : null;
  const payeeMatch = authority ? authority.payTo.toLowerCase() === intent.payTo.toLowerCase() : null;
  const remaining = receipt.dailyCapAtomic && receipt.spentBeforeAtomic
    ? (BigInt(receipt.dailyCapAtomic) - BigInt(receipt.spentBeforeAtomic)).toString() : null;

  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
    <PageHeading label="PAYMENT DECISION" title="Follow the evidence." description="A receipt for one signed agent payment attempt. Each source and the final payment state are shown separately."/>
    <Alert variant={refused ? 'destructive' : 'default'} className="mb-5"><>{refused ? <ShieldAlert className="size-4"/> : <ShieldCheck className="size-4"/>}</><AlertDescription className="flex flex-wrap items-center gap-3"><strong>{statusLabel(receipt.status)}</strong>{receipt.reason && <span>{receipt.reason}</span>}</AlertDescription></Alert>
    <div className="mb-5 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={`/decisions/${id}`}><RefreshCw/>Refresh status</Link></Button><Button asChild variant="outline" size="sm"><a href={`/api/decisions/${id}`} target="_blank" rel="noreferrer">Open receipt JSON <ArrowUpRight/></a></Button></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>1. Agent request</CardTitle><Badge variant="outline">Signed by payer</Badge></div><CardDescription>The source label and payment terms came from the SDK. The policy server verified this wallet signature. A preflight refusal message can never authorize a payment.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="Message purpose" value={intent.purpose === 'preflight_refusal' ? 'Preflight refusal only' : 'Payment authorization request'}/><DataRow label="Candidate source" value={intent.candidateSource === 'bazaar' ? 'CDP Bazaar, agent reported' : 'Configured by agent'}/><DataRow label="Service" value={intent.serviceName}/><DataRow label="Selected resource" value={intent.resourceUrl}/><DataRow label="402 resource observed by SDK" value={intent.observedResourceUrl ?? 'Same as selected resource'}/><DataRow label="402 payee observed by SDK" value={intent.payTo} mono/><DataRow label="Exact amount" value={usdc(intent.amountAtomic)}/><DataRow label="Catalog price" value={intent.catalogAmountAtomic ? usdc(intent.catalogAmountAtomic) : 'No catalog price supplied'}/><DataRow label="Wallet signature" value={receipt.signatureVerified ? 'Verified against the signed intent' : 'Integrity check failed'}/><DataRow label="Intent SHA-256" value={receipt.intentHash} mono/></CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>2. Merchant authority</CardTitle><Badge variant="outline">ENSv2 Sepolia</Badge></div><CardDescription>HuFu resolved the service independently and compared its endpoint and Base Sepolia payee with the signed request.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="ENS endpoint" value={authority?.endpoint ?? 'Not resolved'}/><DataRow label="ENS authorized payee" value={authority?.payTo ?? 'Not resolved'} mono/><DataRow label="Endpoint comparison" value={endpointMatch === null ? 'Not evaluated' : endpointMatch ? 'Match' : 'Mismatch'}/><DataRow label="Payee comparison" value={payeeMatch === null ? 'Not evaluated' : payeeMatch ? 'Match' : 'Mismatch'}/><DataRow label="Resolver" value={authority?.resolver ?? 'Not resolved'} mono/>{authority && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`https://sepolia.etherscan.io/address/${authority.resolver}`} target="_blank" rel="noreferrer">Inspect resolver on Sepolia <ArrowUpRight className="size-3"/></a>}</CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>3. Risk and spending policy</CardTitle><Badge variant="outline">Before signing</Badge></div><CardDescription>The risk result is a provider observation recorded by HuFu, with its own expiry. A cached Low result never extends itself.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="Intercepta tier" value={risk?.tier ?? 'Not evaluated'}/><DataRow label="Scan source" value={risk ? risk.source === 'cache' ? 'Fresh cache' : 'Live Quick Scan' : 'Not evaluated'}/><DataRow label="Risk reasons" value={risk?.reasons.join(', ') || 'None recorded'}/><DataRow label="Risk checked at" value={risk?.scannedAt ?? 'Not evaluated'}/><DataRow label="Risk expires at" value={risk?.expiresAt ?? 'Not evaluated'}/><DataRow label="Per-payment cap" value={usdc(receipt.perPaymentCapAtomic)}/><DataRow label="Owner daily cap" value={usdc(receipt.dailyCapAtomic)}/><DataRow label="Daily amount before this attempt" value={usdc(receipt.spentBeforeAtomic)}/><DataRow label="Remaining before this attempt" value={usdc(remaining)}/></CardContent></Card>
      <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>4. Approval and outcome</CardTitle><Badge variant="outline">Base Sepolia</Badge></div><CardDescription>World confirms a person authorizing a new grant. A reservation or approval is not evidence of onchain settlement.</CardDescription></CardHeader><CardContent className="grid gap-4"><DataRow label="Approval" value={receipt.approvalStatus ?? 'No new approval requested'}/><DataRow label="First of two people approved" value={receipt.approvalId ? receipt.firstApproved ? 'Yes' : 'No' : 'Not required'}/><DataRow label="Reservation" value={receipt.reservationId ?? 'None'} mono/><DataRow label="Payment state" value={statusLabel(receipt.status)}/><DataRow label="Base Sepolia transaction" value={receipt.transactionHash ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`https://sepolia.basescan.org/tx/${receipt.transactionHash}`} target="_blank" rel="noreferrer">{receipt.transactionHash}<ArrowUpRight className="size-4 shrink-0"/></a> : 'No verified settlement receipt'} mono/><DataRow label="Receipt created" value={receipt.createdAt}/></CardContent></Card>
    </div>
    <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground"><Fingerprint className="mr-1 inline size-3"/>The payer signature becomes available in the receipt JSON after {receipt.signatureDisclosureAt}, when authorization and settlement reporting have expired. A chain transaction can be checked independently. The Bazaar label, observed 402 terms, Intercepta result, and policy decision are records from this SDK-mediated flow; they are not merchant-signed attestations.</p>
  </div>;
}

function Unavailable({ reason }: { reason: string }) {
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20"><PageHeading label="PAYMENT DECISION" title="Receipt unavailable." description="A payment decision must be recorded before it can be inspected."/><Alert variant="destructive" className="max-w-2xl"><ShieldAlert className="size-4"/><AlertDescription>{reason}</AlertDescription></Alert></div>;
}
