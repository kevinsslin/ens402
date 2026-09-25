import { redirect } from 'next/navigation';
import { ArrowRight, FileCheck2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeading } from '@/components/page-heading';

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const value = id?.trim();
  if (value && /^[0-9a-f-]{36}$/i.test(value)) redirect(`/decisions/${value}`);
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
    <PageHeading label="DECISION RECEIPTS" title="Inspect one payment attempt." description="HuFu records the signed request, independent authority check, risk verdict, spending policy, approval, and settlement state for each policy-mediated payment."/>
    {value && <Alert variant="destructive" className="mb-5 max-w-2xl"><AlertDescription>Enter a valid receipt ID from the payer CLI.</AlertDescription></Alert>}
    <Card className="max-w-2xl border-primary/25 bg-card/80"><CardHeader><div className="flex items-center gap-3"><FileCheck2 className="size-5 text-primary"/><CardTitle>Open a receipt</CardTitle></div><CardDescription>The payer CLI prints a receipt URL when the policy service evaluates a signed payment intent.</CardDescription></CardHeader><CardContent><form action="/decisions" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="grid flex-1 gap-2"><Label htmlFor="receipt-id">Attempt ID</Label><Input id="receipt-id" name="id" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required className="h-11 font-mono"/></div><Button type="submit" size="lg">Inspect <ArrowRight/></Button></form><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Only the holder of a receipt link can open it. Do not treat the link as a secret if you share it with judges.</p></CardContent></Card>
  </div>;
}
