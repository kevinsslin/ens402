import { PageHeading } from '@/components/page-heading';
import EnrollClient from './enroll-client';
export default async function EnrollPage({ searchParams }: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20"><PageHeading label="AGENT OWNER" title="Enroll your payer." description="Bind an agent's payment wallet to a World-verified owner. That owner can approve new payees and manage the agent's daily limit."/><EnrollClient suggestedWallet={wallet ?? ''}/></div>;
}
