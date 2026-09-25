import { PageHeading } from '@/components/page-heading';
import LookupClient from './lookup-client';
export default async function LookupPage({ searchParams }: { searchParams: Promise<{ name?: string; candidateUrl?: string; candidatePayTo?: string }> }) {
  const params = await searchParams;
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20"><PageHeading label="INDEPENDENT AUTHORITY" title="Verify a service." description="Resolve the merchant's ENSv2 records on Sepolia and compare them with a Bazaar candidate. The SDK also checks the live 402 before payment."/><LookupClient initialName={params.name?.slice(0, 255) ?? ''} candidateUrl={params.candidateUrl?.slice(0, 2048) ?? ''} candidatePayTo={params.candidatePayTo?.slice(0, 42) ?? ''}/></div>;
}
